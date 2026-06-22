"use strict";

const { execSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const THRESHOLD   = 95;
const CONFIG_FILE = ".reactjs-quality-agent.json";

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

function generateTestsWithAI(srcFile) {
    const fname   = path.basename(srcFile);
    const outFile = expectedTestPath(srcFile);
    const src     = fs.readFileSync(srcFile, "utf8");

    const prompt =
        `Generate Jest + React Testing Library tests for ${fname}. ` +
        `Test file should be saved at ${outFile}. ` +
        `Cover: renders correctly, all prop variations, user interactions, error states, loading states. ` +
        `Use screen.getByRole/getByText/getByTestId, mock API calls with jest.fn(). ` +
        `Ensure at least ${THRESHOLD}% line coverage of the source file. ` +
        `Source:\n${src.slice(0, 3000)}`;

    if (cliAvailable("claude")) {
        console.log(`  🤖 No test file found — generating with Claude CLI...`);
        try {
            execSync(`claude "${prompt}"`, { stdio: "inherit", shell: true });
            const found = findTestFile(srcFile);
            if (found) {
                console.log(`  ✅ Claude generated: ${path.basename(found)}`);
                return found;
            }
        } catch (_) {
            console.log(`  ⚠️  Claude generation failed.`);
        }
    }

    if (cliAvailable("gh") && spawnSync("gh", ["copilot", "--version"], { shell: true }).status === 0) {
        console.log(`  🤖 No test file found — generating with GitHub Copilot CLI...`);
        try {
            execSync(`gh copilot suggest -t shell "${prompt}"`, { stdio: "inherit", shell: true });
            const found = findTestFile(srcFile);
            if (found) {
                console.log(`  ✅ Copilot generated: ${path.basename(found)}`);
                return found;
            }
        } catch (_) {
            console.log(`  ⚠️  Copilot CLI generation failed.`);
        }
    }

    // Neither CLI available — guide the user
    console.log(`
  ❌ ${fname} — no test file found and no AI CLI available to generate it.

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

        if (!testFile) {
            testFile = generateTestsWithAI(file);
            if (!testFile) {
                results.push(`❌ ${path.basename(file)}: no test file — commit blocked`);
                failed = true;
                continue;
            }
        }

        try {
            execSync(
                `npx jest "${testFile}" --coverage --coverageReporters=json-summary --passWithNoTests --silent`,
                { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
            );

            const summaryPath = "coverage/coverage-summary.json";
            if (!fs.existsSync(summaryPath)) {
                results.push(`⚠️  ${path.basename(file)}: coverage-summary.json not generated`);
                continue;
            }

            const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
            const absFile = path.resolve(file).replace(/\\/g, "/");
            const matched = Object.entries(summary).find(([k]) =>
                k.replace(/\\/g, "/") === absFile ||
                k.replace(/\\/g, "/").endsWith("/" + file.replace(/\\/g, "/"))
            );

            if (!matched) {
                results.push(`⚠️  ${path.basename(file)}: not found in coverage report`);
                continue;
            }

            const pct  = matched[1].lines.pct;
            const icon = pct >= THRESHOLD ? "✅" : "❌";
            console.log(`  ${icon} ${path.basename(file)}: ${pct}% line coverage`);
            results.push(`${icon} ${path.basename(file)}: ${pct}%`);
            if (pct < THRESHOLD) {
                console.log(`     Coverage is ${pct}% — need ${THRESHOLD}%. Ask Copilot/Claude to add more test cases.`);
                failed = true;
            }

        } catch (e) {
            console.log(`  ❌ ${path.basename(file)}: Jest failed`);
            results.push(`❌ ${path.basename(file)}: Jest execution failed`);
            failed = true;
        }
    }

    console.log("\n--- Coverage Summary ---");
    results.forEach(r => console.log(" ", r));

    if (failed) {
        console.log(`\nCoverage below ${THRESHOLD}% — tests were generated or need more cases. Re-stage and commit again.`);
        process.exit(1);
    }

    console.log(`\n✅ All changed files meet the ${THRESHOLD}% coverage threshold.`);
};
