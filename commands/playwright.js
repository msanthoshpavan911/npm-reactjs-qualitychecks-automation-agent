"use strict";

const { execSync } = require("child_process");
const fs = require("fs");

const CONFIG_FILE = ".reactjs-quality-agent.json";

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
        console.log("\n❌ Playwright tests failed — fix failing tests before pushing.");
        process.exit(1);
    }
};
