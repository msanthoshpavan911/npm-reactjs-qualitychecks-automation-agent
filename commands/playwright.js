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

    // Auto-install Playwright if opted in but not yet installed
    const playwrightInstalled =
        fs.existsSync("node_modules/.bin/playwright") ||
        fs.existsSync("node_modules/@playwright/test");

    if (!playwrightInstalled) {
        console.log("📦 Playwright is enabled but not installed — setting up automatically...\n");

        try {
            console.log("  Step 1/3 — Installing @playwright/test...");
            execSync("npm install -D @playwright/test", { stdio: "inherit" });
            console.log("  ✅ @playwright/test installed.\n");
        } catch (_) {
            console.log(`
❌ Failed to install @playwright/test automatically.

Run manually:
  npm install -D @playwright/test

Then re-commit.
`);
            process.exit(1);
        }

        try {
            console.log("  Step 2/3 — Installing Playwright browsers (chromium only)...");
            execSync("npx playwright install chromium", { stdio: "inherit" });
            console.log("  ✅ Chromium browser installed.\n");
        } catch (_) {
            console.log(`
❌ Failed to install Playwright browsers automatically.

Run manually:
  npx playwright install

Then re-commit.
`);
            process.exit(1);
        }
    }

    // Auto-create playwright config if missing
    const configFiles = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"];
    if (!configFiles.some(f => fs.existsSync(f))) {
        const isTs       = fs.existsSync("tsconfig.json");
        const configFile = isTs ? "playwright.config.ts" : "playwright.config.js";
        const configBody = isTs
            ? `import { defineConfig } from '@playwright/test';\n\nexport default defineConfig({\n  testDir: './tests',\n  use: { baseURL: 'http://localhost:3000' },\n});\n`
            : `const { defineConfig } = require('@playwright/test');\n\nmodule.exports = defineConfig({\n  testDir: './tests',\n  use: { baseURL: 'http://localhost:3000' },\n});\n`;

        fs.writeFileSync(configFile, configBody);
        fs.mkdirSync("tests", { recursive: true });

        console.log(`  Step 3/3 — Created ${configFile} and tests/ directory.`);
        console.log(`  ✅ Update baseURL in ${configFile} to match your dev server URL.\n`);
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
