"use strict";

const { execSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const THRESHOLD    = 95;
const CONFIG_FILE  = ".reactjs-quality-agent.json";
const MAX_AI_RETRY = 2; // max attempts to improve coverage via AI

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (_) { return null; }
}

function getStagedSourceFiles() {
    try {
        const out = execSync("git diff --cached --name-only", { encoding: "utf8" });
        return out.split("\n").map(f => f.trim()).filter(f =>
            f &&
            /\.(js|jsx|ts|tsx)$/.test(f) &&
            !f.includes(".test.") && !f.includes(".spec.") &&
            !f.includes("__tests__") &&
            fs.existsSync(f)
        );
    } catch (_) { return []; }
}

function findTestFile(srcFile) {
    const base    = srcFile.replace(/\.(js|jsx|ts|tsx)$/, "");
    const ext     = srcFile.match(/\.(js|jsx|ts|tsx)$/)[1];
    const testExt = ext === "js" ? "js" : "tsx";
    return [
        `${base}.test.${testExt}`,
        `${base}.test.${ext}`,
        `${base}.spec.${testExt}`,
        `${base}.spec.${ext}`,
        base.replace(/\/src\//, "/src/__tests__/") + `.test.${testExt}`,
        base.replace(/\/src\//, "/src/__tests__/") + `.test.${ext}`,
    ].find(f => fs.existsSync(f));
}

function expectedTestPath(srcFile) {
    const base    = srcFile.replace(/\.(js|jsx|ts|tsx)$/, "");
    const ext     = srcFile.match(/\.(js|jsx|ts|tsx)$/)[1];
    const testExt = ext === "js" ? "js" : "tsx";
    return `${base}.test.${testExt}`;
}

function cliAvailable(cmd) {
    return spawnSync(cmd, ["--version"], { encoding: "utf8", shell: true }).status === 0;
}

function runCoverage(testFile) {
    try {
        execSync(
            `npx jest "${testFile}" --coverage --coverageReporters=json-summary --passWithNoTests --silent`,
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
        );
        return true;
    } catch (_) {
        return false;
    }
}

function readCoveragePct(srcFile) {
    const summaryPath = "coverage/coverage-summary.json";
    if (!fs.existsSync(summaryPath)) return null;
    try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        const absFile = path.resolve(srcFile).replace(/\\/g, "/");
        const matched = Object.entries(summary).find(([k]) =>
            k.replace(/\\/g, "/") === absFile ||
            k.replace(/\\/g, "/").endsWith("/" + srcFile.replace(/\\/g, "/"))
        );
        return matched ? matched[1].lines.pct : null;
    } catch (_) { return null; }
}

function autoStageTestFile(testFile) {
    try {
        execSync(`git add "${testFile}"`, { encoding: "utf8", stdio: "pipe" });
    } catch (_) { /* best-effort */ }
}

function improveWithAI(srcFile, testFile, currentPct) {
    const fname   = path.basename(srcFile);
    const src     = fs.readFileSync(srcFile, "utf8");
    const tests   = fs.existsSync(testFile) ? fs.readFileSync(testFile, "utf8") : "";

    const prompt =
        `The test file for ${fname} only achieves ${currentPct}% line coverage but needs ${THRESHOLD}%. ` +
        `Add more Jest + React Testing Library test cases to reach ${THRESHOLD}% coverage. ` +
        `Focus on uncovered branches, conditional rendering, error states, edge cases, and async flows. ` +
        `Do NOT rewrite existing tests — only add new ones. ` +
        `Test file: ${testFile}. ` +
        `Source (first 2000 chars):\n${src.slice(0, 2000)}\n` +
        `Existing tests (first 1500 chars):\n${tests.slice(0, 1500)}`;

    if (cliAvailable("claude")) {
        console.log(`  🤖 Coverage ${currentPct}% — asking Claude to add more test cases...`);
        try {
            execSync(`claude "${prompt}"`, { stdio: "inherit", shell: true });
            return true;
        } catch (_) {
            console.log(`  ⚠️  Claude improvement failed.`);
        }
    }

    if (cliAvailable("gh") && spawnSync("gh", ["copilot", "--version"], { shell: true }).status === 0) {
        console.log(`  🤖 Coverage ${currentPct}% — asking GitHub Copilot to add more test cases...`);
        try {
            execSync(`gh copilot suggest -t shell "${prompt}"`, { stdio: "inherit", shell: true });
            return true;
        } catch (_) {
            console.log(`  ⚠️  Copilot CLI improvement failed.`);
        }
    }

    return false;
}

function generateTestsWithAI(srcFile) {
    const fname   = path.basename(srcFile);
    const outFile = expectedTestPath(srcFile);
    const src     = fs.readFileSync(srcFile, "utf8");

    const prompt =
        `Generate Jest + React Testing Library tests for ${fname}. ` +
        `Save the test file at ${outFile}. ` +
        `Cover: renders correctly, all prop variations, user interactions, error states, loading states. ` +
        `Use screen.getByRole/getByText/getByTestId. Mock API calls with jest.fn(). ` +
        `Ensure at least ${THRESHOLD}% line coverage. ` +
        `Source:\n${src.slice(0, 3000)}`;

    if (cliAvailable("claude")) {
        console.log(`  🤖 No test file found — generating with Claude CLI...`);
        try {
            execSync(`claude "${prompt}"`, { stdio: "inherit", shell: true });
            const found = findTestFile(srcFile);
            if (found) { console.log(`  ✅ Claude generated: ${path.basename(found)}`); return found; }
        } catch (_) {
            console.log(`  ⚠️  Claude generation failed.`);
        }
    }

    if (cliAvailable("gh") && spawnSync("gh", ["copilot", "--version"], { shell: true }).status === 0) {
        console.log(`  🤖 No test file found — generating with GitHub Copilot CLI...`);
        try {
            execSync(`gh copilot suggest -t shell "${prompt}"`, { stdio: "inherit", shell: true });
            const found = findTestFile(srcFile);
            if (found) { console.log(`  ✅ Copilot generated: ${path.basename(found)}`); return found; }
        } catch (_) {
            console.log(`  ⚠️  Copilot CLI generation failed.`);
        }
    }

    console.log(`
  ❌ ${fname} — no test file found and no AI CLI available.

  Generate tests using one of these options:

    1. Claude (VS Code extension or claude.ai/code):
       Ask: "Generate Jest + React Testing Library tests for ${fname} with 95%+ coverage"

    2. GitHub Copilot Chat (VS Code):
       Ask: "@workspace Generate Jest tests for ${fname} covering all props and interactions"

    3. Create ${outFile} manually, then re-commit.
`);
    return null;
}

module.exports = function coverage() {
    const config = loadConfig();
    if (!config) {
        console.error("No .reactjs-quality-agent.json found — run `reactjsquality-check911 init` first.");
        process.exit(1);
    }
    if (!config.checks.coverage) {
        console.log("Coverage check is disabled — skipping.");
        return;
    }

    const sources = getStagedSourceFiles();
    if (!sources.length) {
        console.log("No staged source files — skipping coverage.");
        return;
    }

    console.log(`Verifying Jest coverage for: ${sources.map(f => path.basename(f)).join(", ")}\n`);
    const results = [];
    let failed    = false;

    for (const file of sources) {
        let testFile = findTestFile(file);

        // No test file — generate via AI first
        if (!testFile) {
            testFile = generateTestsWithAI(file);
            if (!testFile) {
                results.push(`❌ ${path.basename(file)}: no test file — commit blocked`);
                failed = true;
                continue;
            }
            autoStageTestFile(testFile);
        }

        // Run coverage
        const jestOk = runCoverage(testFile);
        if (!jestOk) {
            console.log(`  ❌ ${path.basename(file)}: Jest failed to run`);
            results.push(`❌ ${path.basename(file)}: Jest execution failed`);
            failed = true;
            continue;
        }

        let pct = readCoveragePct(file);
        if (pct === null) {
            results.push(`⚠️  ${path.basename(file)}: not found in coverage report`);
            continue;
        }

        // If below threshold, keep asking AI to improve — up to MAX_AI_RETRY times
        let attempt = 0;
        while (pct < THRESHOLD && attempt < MAX_AI_RETRY) {
            attempt++;
            console.log(`  ⚠️  ${path.basename(file)}: ${pct}% — below ${THRESHOLD}% (attempt ${attempt}/${MAX_AI_RETRY})`);
            const improved = improveWithAI(file, testFile, pct);
            if (!improved) break;

            autoStageTestFile(testFile);
            runCoverage(testFile);
            pct = readCoveragePct(file) ?? pct;
        }

        const icon = pct >= THRESHOLD ? "✅" : "❌";
        console.log(`  ${icon} ${path.basename(file)}: ${pct}% line coverage`);
        results.push(`${icon} ${path.basename(file)}: ${pct}%`);

        if (pct < THRESHOLD) {
            console.log(`
  ❌ Coverage is still ${pct}% after ${MAX_AI_RETRY} AI improvement attempt(s).

  Please manually add test cases in ${testFile} to cover:
    - Uncovered branches and conditional rendering
    - Error and empty states
    - Async operations and API call responses

  Then stage the file and commit again:
    git add ${testFile}
    git commit
`);
            failed = true;
        } else {
            console.log(`  ✅ Coverage reached ${pct}% — test file auto-staged.`);
        }
    }

    console.log("\n--- Coverage Summary ---");
    results.forEach(r => console.log(" ", r));

    if (failed) {
        process.exit(1);
    }

    console.log(`\n✅ All changed files meet the ${THRESHOLD}% coverage threshold.`);
};
