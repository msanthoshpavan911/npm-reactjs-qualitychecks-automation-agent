"use strict";

const { execSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const CONFIG_FILE = ".reactjs-quality-agent.json";

const TEST_DIRS   = ["tests", "e2e", "playwright", "src/__tests__"];
const TEST_GLOBS  = [".spec.ts", ".spec.js", ".spec.tsx", ".test.ts", ".test.js"];

function hasTestFiles() {
    for (const dir of TEST_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const walk = (d) => {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                if (entry.isDirectory()) { walk(path.join(d, entry.name)); continue; }
                if (TEST_GLOBS.some(ext => entry.name.endsWith(ext))) return true;
            }
            return false;
        };
        if (walk(dir)) return true;
    }
    return false;
}

function cliAvailable(cmd) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8", shell: true });
    return r.status === 0;
}

function tryGenerateWithAI() {
    const prompt =
        "Generate Playwright smoke tests for this project. " +
        "Cover the main user flows, form submissions, and navigation. " +
        "Use Page Object Model pattern. Save files under the tests/ directory.";

    if (cliAvailable("claude")) {
        console.log("🤖 No Playwright tests found — generating with Claude CLI...\n");
        try {
            execSync(`claude "${prompt}"`, { stdio: "inherit", shell: true });
            console.log("\n✅ Claude generated Playwright tests.");
            return true;
        } catch (_) {
            console.log("⚠️  Claude generation failed.");
        }
    }

    if (cliAvailable("gh") && cliAvailable("gh copilot")) {
        console.log("🤖 No Playwright tests found — generating with GitHub Copilot CLI...\n");
        try {
            execSync(`gh copilot suggest -t shell "${prompt}"`, { stdio: "inherit", shell: true });
            console.log("\n✅ Copilot generated Playwright tests.");
            return true;
        } catch (_) {
            console.log("⚠️  Copilot CLI generation failed.");
        }
    }

    // Neither CLI available — guide the user
    console.log(`
⚠️  No Playwright test files found and no AI CLI available to generate them.

Generate tests using one of these options:

  1. Claude (claude.ai/code or VS Code extension):
     Ask: "Generate Playwright smoke tests for this project using Page Object Model"

  2. GitHub Copilot Chat (VS Code):
     Ask: "@workspace Generate Playwright tests for the main user flows in tests/"

  3. Create manually then re-commit.
`);
    return false;
}

module.exports = function playwright() {
    const config = (() => {
        try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (_) { return null; }
    })();

    if (!config) {
        console.error("No .reactjs-quality-agent.json found — run `reactjsquality-check911 init` first.");
        process.exit(1);
    }
    if (!config.checks.playwright) {
        console.log("Playwright check is disabled — skipping.");
        return;
    }

    // Verify playwright is installed
    if (!fs.existsSync("node_modules/.bin/playwright") && !fs.existsSync("node_modules/@playwright/test")) {
        console.log("⚠️  Playwright not installed — skipping.");
        console.log("   Run: npm install -D @playwright/test && npx playwright install");
        return;
    }

    // Verify playwright config exists
    const configFiles = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"];
    if (!configFiles.some(f => fs.existsSync(f))) {
        console.log("⚠️  No playwright.config.ts found — skipping.");
        console.log("   Run: npx playwright init");
        return;
    }

    // If no test files exist, attempt AI generation
    if (!hasTestFiles()) {
        const generated = tryGenerateWithAI();
        if (!generated) {
            process.exit(1);
        }
    }

    console.log("Running Playwright smoke tests...\n");

    try {
        const out = execSync("npx playwright test --reporter=list", {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"]
        });
        console.log(out);
        console.log("✅ All Playwright tests passed.");
    } catch (e) {
        const output = (e.stdout || "") + (e.stderr || "");
        console.log(output);
        console.log("\n❌ Playwright tests failed.");
        console.log("   Fix with AI: ask Copilot Chat or Claude to fix the failing tests.");
        process.exit(1);
    }
};
