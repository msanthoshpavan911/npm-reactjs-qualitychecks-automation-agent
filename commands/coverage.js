"use strict";

const { execSync } = require("child_process");
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
            /\.(js|jsx|ts|tsx|vue)$/.test(f) &&
            !f.includes(".test.") && !f.includes(".spec.") &&
            !f.includes("__tests__") &&
            fs.existsSync(f)
        );
    } catch (_) { return []; }
}

function findTestFile(srcFile) {
    const base = srcFile.replace(/\.(js|jsx|ts|tsx|vue)$/, "");
    const ext  = srcFile.match(/\.(js|jsx|ts|tsx|vue)$/)[1];
    const testExt = ext === "js" ? "js" : ext === "jsx" ? "tsx" : "tsx";
    return [
        `${base}.test.${testExt}`,
        `${base}.test.${ext}`,
        `${base}.spec.${testExt}`,
        `${base}.spec.${ext}`,
        base.replace(/\/src\//, "/src/__tests__/") + `.test.${testExt}`,
        base.replace(/\/src\//, "/src/__tests__/") + `.test.${ext}`,
    ].find(f => fs.existsSync(f));
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
        const testFile = findTestFile(file);
        if (!testFile) {
            const expected = path.basename(file).replace(/\.(js|jsx|ts|tsx)$/, ".test.$1");
            console.log(`  ⚠️  ${path.basename(file)} — no test file found (expected ${expected})`);
            results.push(`⚠️  ${path.basename(file)}: no test file`);
            continue;
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

            const summary  = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
            const absFile  = path.resolve(file).replace(/\\/g, "/");
            const matched  = Object.entries(summary).find(([k]) =>
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
            if (pct < THRESHOLD) failed = true;

        } catch (e) {
            console.log(`  ❌ ${path.basename(file)}: Jest failed`);
            results.push(`❌ ${path.basename(file)}: Jest execution failed`);
            failed = true;
        }
    }

    console.log("\n--- Coverage Summary ---");
    results.forEach(r => console.log(" ", r));

    if (failed) {
        console.log(`\nCoverage below ${THRESHOLD}% — add tests and try again.`);
        process.exit(1);
    }

    console.log(`\n✅ All changed files meet the ${THRESHOLD}% coverage threshold.`);
};
