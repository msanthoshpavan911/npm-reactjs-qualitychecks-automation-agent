"use strict";

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const CONFIG_FILE = ".reactjs-quality-agent.json";

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (_) { return null; }
}

function getStagedFiles() {
    try {
        const out = execSync("git diff --cached --name-only", { encoding: "utf8" });
        return out.split("\n").map(f => f.trim())
            .filter(f => f && /\.(js|jsx|ts|tsx|vue|svelte)$/.test(f) && fs.existsSync(f));
    } catch (_) { return []; }
}

function getChangedLineRanges() {
    try {
        const diff = execSync("git diff --cached --unified=0", { encoding: "utf8" });
        const ranges = {};
        let cur = null;
        for (const line of diff.split("\n")) {
            const fileM = /^\+\+\+ b\/(.+)$/.exec(line);
            if (fileM) { cur = fileM[1]; if (!ranges[cur]) ranges[cur] = []; continue; }
            if (line.startsWith("+++ /dev/null")) { cur = null; continue; }
            const hunkM = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
            if (hunkM && cur) {
                const start = parseInt(hunkM[1]);
                const count = hunkM[2] !== undefined ? parseInt(hunkM[2]) : 1;
                if (count > 0) ranges[cur].push([start, start + count - 1]);
            }
        }
        return ranges;
    } catch (_) { return {}; }
}

function findRanges(filePath, changedRanges) {
    const norm = filePath.replace(/\\/g, "/").toLowerCase();
    for (const [gitPath, ranges] of Object.entries(changedRanges)) {
        const gn = gitPath.toLowerCase();
        if (norm === gn || norm.endsWith("/" + gn)) return ranges;
    }
    return null;
}

function inChangedRange(lineNum, ranges) {
    if (!ranges || isNaN(lineNum)) return false;
    return ranges.some(([s, e]) => lineNum >= s && lineNum <= e);
}

function runEslint(staged, changedRanges) {
    process.stdout.write("Running ESLint...     ");
    try {
        const fileArgs = staged.map(f => `"${f}"`).join(" ");
        let output = "";
        try {
            output = execSync(`npx eslint ${fileArgs} --format json`, {
                encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
            });
        } catch (e) {
            // ESLint exits with code 1 when violations found — stdout still has JSON
            output = e.stdout || "[]";
        }

        const data   = JSON.parse(output || "[]");
        const viols  = [];
        const errors = [];

        for (const file of data) {
            const ranges = findRanges(file.filePath, changedRanges);
            if (!ranges) continue;
            for (const msg of file.messages) {
                if (!inChangedRange(msg.line, ranges)) continue;
                const label = msg.severity === 2 ? "error" : "warn";
                const entry = `  [ESLint:${msg.ruleId || "unknown"}] ${path.basename(file.filePath)}:${msg.line} — ${msg.message} (${label})`;
                viols.push(entry);
                if (msg.severity === 2) errors.push(entry);
            }
        }

        if (errors.length) {
            console.log("❌");
            viols.forEach(v => console.log(v));
            return { passed: false, summary: `❌ ESLint: ${errors.length} error(s) in your changed lines` };
        }
        console.log("✅");
        if (viols.length) viols.forEach(v => console.log(v)); // show warnings only
        return { passed: true, summary: "✅ ESLint passed" };
    } catch (e) {
        console.log("⚠️");
        return { passed: true, summary: "⚠️  ESLint: not installed — run `npm install eslint` in your project" };
    }
}

function runTypeScript(staged) {
    const tsFiles = staged.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
    process.stdout.write("Running TypeScript... ");
    if (!tsFiles.length) {
        console.log("✅ (no TS files staged)");
        return { passed: true, summary: "✅ TypeScript: no TS files staged" };
    }
    try {
        execSync("npx tsc --noEmit", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        console.log("✅");
        return { passed: true, summary: "✅ TypeScript passed" };
    } catch (e) {
        const lines = ((e.stdout || "") + (e.stderr || ""))
            .split("\n").filter(l => l.includes("error TS")).slice(0, 5);
        console.log("❌");
        lines.forEach(l => console.log(" ", l.trim()));
        return { passed: false, summary: "❌ TypeScript: type errors found" };
    }
}

module.exports = function quality() {
    const config = loadConfig();
    if (!config) {
        console.error("No .reactjs-quality-agent.json found — run `reactjsquality-check911 init` first.");
        process.exit(1);
    }

    const staged = getStagedFiles();
    if (!staged.length) {
        console.log("No staged JS/TS files — skipping quality checks.");
        return;
    }

    const changedRanges = getChangedLineRanges();
    console.log(`Checking changed chunks in: ${staged.map(f => path.basename(f)).join(", ")}\n`);

    const results = [];
    let failed    = false;

    if (config.checks.eslint !== false) {
        const r = runEslint(staged, changedRanges);
        results.push(r.summary);
        if (!r.passed) failed = true;
    }

    const r2 = runTypeScript(staged);
    results.push(r2.summary);
    if (!r2.passed) failed = true;

    console.log("\n--- Quality Summary ---");
    results.forEach(r => console.log(r));

    if (failed) {
        console.log("\nFix violations and commit again, or ask Copilot:");
        console.log("  'Fix the quality violations in my staged files'");
        process.exit(1);
    }

    console.log("\nAll quality checks passed.");
};
