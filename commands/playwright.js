"use strict";

const { execSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const CONFIG_FILE = ".reactjs-quality-agent.json";
const TEST_DIRS   = ["tests", "e2e", "playwright"];

// Pages/views are the right targets for Playwright E2E tests
const PAGE_PATTERNS = [
    /\/pages?\//i, /\/views?\//i, /\/screens?\//i, /\/routes?\//i,
    /Page\.(jsx?|tsx?)$/, /View\.(jsx?|tsx?)$/, /Screen\.(jsx?|tsx?)$/,
    /Dashboard\.(jsx?|tsx?)$/, /Layout\.(jsx?|tsx?)$/
];

function getStagedPageFiles() {
    try {
        const out = execSync("git diff --cached --name-only", { encoding: "utf8" });
        return out.split("\n").map(f => f.trim()).filter(f =>
            f &&
            /\.(js|jsx|ts|tsx)$/.test(f) &&
            !f.includes(".test.") && !f.includes(".spec.") &&
            !f.includes("__tests__") &&
            fs.existsSync(f) &&
            PAGE_PATTERNS.some(p => p.test(f))
        );
    } catch (_) { return []; }
}

function getAllStagedSourceFiles() {
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

function specFileFor(srcFile) {
    const name    = path.basename(srcFile).replace(/\.(jsx?|tsx?)$/, "");
    const isTs    = srcFile.endsWith(".ts") || srcFile.endsWith(".tsx");
    const ext     = isTs ? "ts" : "js";
    return path.join("tests", `${name}.spec.${ext}`);
}

function hasSpecForFile(srcFile) {
    const name = path.basename(srcFile).replace(/\.(jsx?|tsx?)$/, "");
    for (const dir of TEST_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const found = fs.readdirSync(dir).find(f =>
            f.startsWith(name) && (f.endsWith(".spec.ts") || f.endsWith(".spec.js"))
        );
        if (found) return path.join(dir, found);
    }
    return null;
}

function cliAvailable(cmd) {
    return spawnSync(cmd, ["--version"], { encoding: "utf8", shell: true }).status === 0;
}

function autoStage(filePath) {
    try { execSync(`git add "${filePath}"`, { stdio: "pipe" }); } catch (_) {}
}

function buildPrompt(srcFile) {
    const fname = path.basename(srcFile);
    const name  = fname.replace(/\.(jsx?|tsx?)$/, "");
    const src   = fs.readFileSync(srcFile, "utf8");
    const spec  = specFileFor(srcFile);

    return (
        `Generate a Playwright E2E test file for the React component/page "${fname}". ` +
        `Save it at: ${spec}. ` +
        `Use Page Object Model pattern with a class named ${name}Page. ` +
        `Cover: page load and visible elements, form submissions (if any), button clicks and navigation, ` +
        `error states and validation messages, any API calls mocked with page.route(). ` +
        `Use expect(locator).toBeVisible(), toHaveText(), toHaveURL(). ` +
        `Do NOT generate a generic smoke.spec file — this must test "${fname}" specifically. ` +
        `Component source (first 3000 chars):\n${src.slice(0, 3000)}`
    );
}

function generateSpecForFile(srcFile) {
    const fname = path.basename(srcFile);
    const spec  = specFileFor(srcFile);

    if (cliAvailable("claude")) {
        console.log(`  🤖 Generating Playwright spec for ${fname} with Claude CLI...`);
        try {
            execSync(`claude "${buildPrompt(srcFile)}"`, { stdio: "inherit", shell: true });
            if (fs.existsSync(spec)) {
                autoStage(spec);
                console.log(`  ✅ Generated and staged: ${spec}`);
                return spec;
            }
            console.log(`  ⚠️  Claude ran but ${spec} was not created.`);
        } catch (_) {
            console.log(`  ⚠️  Claude generation failed.`);
        }
    }

    if (cliAvailable("gh") && spawnSync("gh", ["copilot", "--version"], { shell: true }).status === 0) {
        console.log(`  🤖 Generating Playwright spec for ${fname} with GitHub Copilot CLI...`);
        try {
            execSync(`gh copilot suggest -t shell "${buildPrompt(srcFile)}"`, { stdio: "inherit", shell: true });
            if (fs.existsSync(spec)) {
                autoStage(spec);
                console.log(`  ✅ Generated and staged: ${spec}`);
                return spec;
            }
            console.log(`  ⚠️  Copilot ran but ${spec} was not created.`);
        } catch (_) {
            console.log(`  ⚠️  Copilot CLI generation failed.`);
        }
    }

    // No CLI available — show specific instructions for this file
    console.log(`
  ❌ No Playwright spec found for ${fname} and no AI CLI available.

  Create tests/${path.basename(spec)} using one of these options:

    1. Claude (VS Code extension or claude.ai/code):
       Ask: "Generate a Playwright E2E test for ${fname} using Page Object Model.
             Cover page load, form submissions, button clicks, and error states."

    2. GitHub Copilot Chat (VS Code):
       Ask: "@workspace Generate Playwright tests for ${fname} covering all user flows in tests/${path.basename(spec)}"

  Then stage the file and re-commit:
    git add tests/${path.basename(spec)}
    git commit
`);
    return null;
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
            console.log("❌ Failed to install @playwright/test.\n\n  Run: npm install -D @playwright/test\n\nThen re-commit.");
            process.exit(1);
        }
        try {
            console.log("  Step 2/3 — Installing Playwright browsers (chromium only)...");
            execSync("npx playwright install chromium", { stdio: "inherit" });
            console.log("  ✅ Chromium browser installed.\n");
        } catch (_) {
            console.log("❌ Failed to install browsers.\n\n  Run: npx playwright install\n\nThen re-commit.");
            process.exit(1);
        }
    }

    // Auto-create playwright config if missing
    const configFiles = ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"];
    if (!configFiles.some(f => fs.existsSync(f))) {
        const isTs = fs.existsSync("tsconfig.json");

        // Detect CRA vs Vite React
        let devCommand = "npm start";
        let port       = 3000;
        try {
            const pkg  = JSON.parse(fs.readFileSync("package.json", "utf8"));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps["vite"] || deps["@vitejs/plugin-react"]) {
                devCommand = "npm run dev";
                port = 5173;
            }
        } catch (_) {}

        const baseURL    = `http://localhost:${port}`;
        const configFile = isTs ? "playwright.config.ts" : "playwright.config.js";

        const tsConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: '${baseURL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: '${devCommand}',
    url: '${baseURL}',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
`;
        const jsConfig = `const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: '${baseURL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: '${devCommand}',
    url: '${baseURL}',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
`;
        fs.writeFileSync(configFile, isTs ? tsConfig : jsConfig);
        fs.mkdirSync("tests", { recursive: true });
        console.log(`  Step 3/3 — Created ${configFile}`);
        console.log(`  ✅ Dev server: "${devCommand}" → ${baseURL}`);
        console.log(`     If your app runs on a different port, update baseURL in ${configFile}.\n`);
    }

    fs.mkdirSync("tests", { recursive: true });

    // Determine which staged files need Playwright specs
    let targets = getStagedPageFiles();
    if (!targets.length) {
        // Fallback: all staged source files if none match page patterns
        targets = getAllStagedSourceFiles();
    }

    let failed = false;

    if (targets.length) {
        console.log(`Checking Playwright specs for: ${targets.map(f => path.basename(f)).join(", ")}\n`);

        for (const srcFile of targets) {
            let spec = hasSpecForFile(srcFile);

            if (!spec) {
                spec = generateSpecForFile(srcFile);
                if (!spec) {
                    failed = true;
                    continue;
                }
            } else {
                console.log(`  ✅ Found existing spec: ${spec}`);
            }
        }
    } else {
        console.log("No staged source files matched — skipping Playwright spec generation.");
    }

    if (failed) {
        console.log("\n❌ Missing Playwright specs for staged files — commit blocked.");
        process.exit(1);
    }

    console.log("\nRunning Playwright tests...\n");

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
        console.log("   Ask Copilot Chat or Claude: 'Fix the failing Playwright tests in the tests/ directory'");
        process.exit(1);
    }
};
