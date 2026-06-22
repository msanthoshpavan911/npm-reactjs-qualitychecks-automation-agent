"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const PKG_ROOT = path.join(__dirname, "..");

const CHECKS = [
    { id: "eslint",           label: "ESLint          — code style and error rules on staged chunks" },
    { id: "codesmells",       label: "Code Smells      — SonarJS: cognitive complexity, duplicate code, dead code" },
    { id: "vulnerabilities",  label: "Vulnerabilities  — eslint-security: eval/injection/unsafe regex + npm audit CVE scan on commit" },
    { id: "coverage",         label: "Coverage         — Jest line coverage (95% threshold per changed file)" },
    { id: "playwright",       label: "Playwright       — E2E smoke tests run before every git commit" }
];

const COPILOT_INSTRUCTIONS = `# Frontend Quality Agent

You are a Senior Frontend Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest tests for every component, hook, and utility function
- Fix ESLint and TypeScript violations in staged files
- Ensure 95% Jest line coverage on changed files
- Generate Playwright tests for new pages and user flows

## How to Work Efficiently
Use the \`scan\` MCP tool to find relevant components before answering.
Use the \`read_file\` MCP tool to read only the specific file needed.
Use the \`fix\` MCP tool when the user asks to fix quality issues.

## Test Generation Rules — Jest
- File naming: \`{Name}.test.ts\` or \`{Name}.test.tsx\`
- Method naming: \`should {expected behavior} when {condition}\`
- Cover: render output, user interactions, props, error states, loading states
- Mock API calls with \`jest.fn()\` or MSW (Mock Service Worker)
- Use \`screen.getByRole\`, \`getByText\`, \`getByTestId\` — avoid querying by class/id

## Test Generation Rules — Playwright
- File naming: \`tests/{page-name}.spec.ts\`
- Cover: happy path, form validation, navigation flows, error states
- Use Page Object Model pattern
- Assertions: \`expect(locator).toBeVisible()\`, \`toHaveText()\`, \`toHaveURL()\`

## Quality Standards
- No unused variables, no console.log in production code, no implicit \`any\`
- Jest: 95% minimum line coverage on changed files
- Playwright: all smoke tests must pass before every commit
`;

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

module.exports = async function init() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("\nreactjsquality-check911 — setup\n");

    // ── Quality checks selection ──────────────────────────────────────────────
    console.log("Select quality checks to enable:");
    CHECKS.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
    const checksRaw = (await ask(rl, "\nEnter numbers separated by commas (press Enter to enable all): ")).trim();
    rl.close();

    let selectedIds;
    if (!checksRaw) {
        selectedIds = CHECKS.map(c => c.id);
    } else {
        selectedIds = checksRaw.split(",").map(n => {
            const idx = parseInt(n.trim()) - 1;
            return CHECKS[idx] ? CHECKS[idx].id : null;
        }).filter(Boolean);
    }

    const checks = {};
    for (const c of CHECKS) checks[c.id] = selectedIds.includes(c.id);

    // ── Write .reactjs-quality-agent.json ────────────────────────────────────
    const config = { checks };
    fs.writeFileSync(".reactjs-quality-agent.json", JSON.stringify(config, null, 2));
    console.log("\n✅ .reactjs-quality-agent.json created");

    // ── .github/copilot-instructions.md ──────────────────────────────────────
    fs.mkdirSync(".github/instructions", { recursive: true });
    fs.writeFileSync(".github/copilot-instructions.md", COPILOT_INSTRUCTIONS);
    console.log("✅ .github/copilot-instructions.md created");

    // ── .vscode/mcp.json ─────────────────────────────────────────────────────
    fs.mkdirSync(".vscode", { recursive: true });
    const mcpServerPath = path.join(PKG_ROOT, "mcp-server", "server.py");
    const mcpConfig = {
        servers: {
            "reactjs-quality-agent": {
                type: "stdio",
                command: "python",
                args: [mcpServerPath],
                env: {}
            }
        }
    };
    fs.writeFileSync(".vscode/mcp.json", JSON.stringify(mcpConfig, null, 2));
    console.log("✅ .vscode/mcp.json configured");

    // ── docs stubs ────────────────────────────────────────────────────────────
    fs.mkdirSync("docs", { recursive: true });
    if (!fs.existsSync("docs/architecture.md"))
        fs.writeFileSync("docs/architecture.md", `# Frontend Architecture\n\nRun \`reactjsquality-check911 scan\` to generate this file.\n`);
    if (!fs.existsSync("docs/component-index.md"))
        fs.writeFileSync("docs/component-index.md", `# Component Index\n\nRun \`reactjsquality-check911 scan\` to generate this file.\n`);
    console.log("✅ docs/ stubs created");

    console.log(`
Setup complete!

Enabled checks:
${Object.entries(checks).map(([k, v]) => `  ${v ? "✅" : "❌"}  ${k}`).join("\n")}

Next steps:
  reactjsquality-check911 scan     — index your components for Copilot
  reactjsquality-check911 hooks    — install pre-commit git hook
`);
};
