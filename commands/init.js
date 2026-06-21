"use strict";

const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const PKG_ROOT = path.join(__dirname, "..");

const FRAMEWORKS = [
    { id: "react",   label: "React" },
    { id: "nextjs",  label: "Next.js" },
    { id: "vue",     label: "Vue / Nuxt" },
    { id: "angular", label: "Angular" },
    { id: "vanilla", label: "Vanilla JS / TypeScript" }
];

const CHECKS = [
    { id: "eslint",           label: "ESLint          — code style and error rules on staged chunks" },
    { id: "codesmells",       label: "Code Smells      — SonarJS: cognitive complexity, duplicate code, dead code" },
    { id: "vulnerabilities",  label: "Vulnerabilities  — eslint-security: eval/injection/unsafe regex + npm audit CVE scan on push" },
    { id: "coverage",         label: "Coverage         — Jest line coverage (80% threshold per changed file)" },
    { id: "playwright",       label: "Playwright       — E2E smoke tests run before every git push" }
];

const COPILOT_INSTRUCTIONS = {
    react: `# React Quality Agent

You are a Senior React Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest + React Testing Library tests for every component and hook
- Fix ESLint and TypeScript violations in staged files
- Ensure 80% Jest line coverage on changed files
- Generate Playwright tests for new pages and user flows

## How to Work Efficiently
Use the \`index\` MCP tool to find relevant components before answering.
Use the \`read_file\` MCP tool to read only the specific file needed.
Use the \`fix\` MCP tool when the user asks to fix quality issues.

## Test Generation Rules — Jest + React Testing Library
- File naming: \`{ComponentName}.test.tsx\`
- Method naming: \`should {expected behavior} when {condition}\`
- Cover: render output, user interactions, props, error boundaries, loading states
- Use \`@testing-library/user-event\` for all user interactions (click, type, select)
- Mock API calls with \`jest.fn()\` or \`msw\` (Mock Service Worker)
- Use \`screen.getByRole\`, \`getByText\`, \`getByTestId\` — avoid querying by class/id

## Test Generation Rules — Playwright
- File naming: \`tests/{page-name}.spec.ts\`
- Cover: happy path, form validation, navigation flows, error states
- Use page object model pattern
- Assertions: \`expect(locator).toBeVisible()\`, \`toHaveText()\`, \`toHaveURL()\`

## Quality Standards
- ESLint: react/recommended + typescript-eslint/recommended
- No unused variables, no console.log in production code, no implicit \`any\`
- Jest: 80% minimum line coverage on changed files
- Playwright: all smoke tests must pass before every push
`,
    nextjs: `# Next.js Quality Agent

You are a Senior Next.js Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest + React Testing Library tests for components and API routes
- Fix ESLint and TypeScript violations in staged files
- Ensure 80% Jest line coverage on changed files
- Generate Playwright tests for new pages

## Test Generation Rules — Jest
- File naming: \`{name}.test.tsx\` (components), \`{route}.test.ts\` (API routes)
- For API routes: use \`NextRequest\` / \`NextResponse\` mocks
- For server components: test the data-fetching logic separately from rendering
- For client components: use React Testing Library same as React

## Test Generation Rules — Playwright
- File naming: \`tests/{page-name}.spec.ts\`
- Cover: page navigation, SSR content visible, client-side transitions
- Use \`page.goto()\` with full paths matching Next.js routing

## Quality Standards
- ESLint: next/core-web-vitals rules
- No \`<img>\` — use Next.js \`<Image>\`
- No \`<a>\` for internal links — use \`<Link>\`
- Jest: 80% minimum line coverage
`,
    vue: `# Vue Quality Agent

You are a Senior Vue Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest + Vue Test Utils tests for every component
- Fix ESLint and TypeScript violations in staged files
- Ensure 80% Jest line coverage on changed files
- Generate Playwright tests for new pages

## Test Generation Rules — Jest
- File naming: \`{ComponentName}.test.ts\`
- Use \`mount\` for full rendering, \`shallowMount\` for unit isolation
- Cover: props, emits, slots, user interactions, computed values
- Mock Pinia stores with \`createTestingPinia()\`

## Quality Standards
- ESLint: vue3/recommended + TypeScript
- Composition API only — no Options API
- Jest: 80% minimum line coverage
`,
    angular: `# Angular Quality Agent

You are a Senior Angular Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest tests for components, services, guards, and pipes
- Fix ESLint and TypeScript violations in staged files
- Ensure 80% Jest line coverage on changed files

## Test Generation Rules — Jest
- File naming: \`{name}.spec.ts\`
- Use \`TestBed.configureTestingModule()\` for component and service tests
- Use \`HttpClientTestingModule\` + \`HttpTestingController\` for HTTP services
- Cover: component rendering, service methods, guards, directive behavior

## Quality Standards
- ESLint: Angular recommended + TypeScript strict
- Jest: 80% minimum line coverage
`,
    vanilla: `# Vanilla JS/TS Quality Agent

You are a Senior JavaScript/TypeScript Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest tests for every exported function and class
- Fix ESLint and TypeScript violations in staged files
- Ensure 80% Jest line coverage on changed files

## Test Generation Rules — Jest
- File naming: \`{module-name}.test.ts\`
- Cover: return values, side effects, edge cases, thrown exceptions
- Mock dependencies with \`jest.fn()\` and \`jest.spyOn()\`

## Quality Standards
- ESLint: recommended + TypeScript strict
- Jest: 80% minimum line coverage
`
};

function ask(rl, question) {
    return new Promise(resolve => rl.question(question, resolve));
}

module.exports = async function init() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("\nreactjsquality-check911 — setup\n");

    // ── Framework selection ───────────────────────────────────────────────────
    console.log("Select your frontend framework:");
    FRAMEWORKS.forEach((f, i) => console.log(`  ${i + 1}. ${f.label}`));
    const fwRaw  = (await ask(rl, "\nEnter number (default: 1 — React): ")).trim() || "1";
    const fwIdx  = parseInt(fwRaw) - 1;
    const framework = FRAMEWORKS[fwIdx] || FRAMEWORKS[0];
    console.log(`Selected: ${framework.label}\n`);

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
    const config = { framework: framework.id, checks };
    fs.writeFileSync(".reactjs-quality-agent.json", JSON.stringify(config, null, 2));
    console.log("\n✅ .reactjs-quality-agent.json created");

    // ── .github/copilot-instructions.md ──────────────────────────────────────
    fs.mkdirSync(".github/instructions", { recursive: true });
    const instructions = COPILOT_INSTRUCTIONS[framework.id] || COPILOT_INSTRUCTIONS.react;
    fs.writeFileSync(".github/copilot-instructions.md", instructions);
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
Setup complete for ${framework.label}!

Enabled checks:
${Object.entries(checks).map(([k, v]) => `  ${v ? "✅" : "❌"}  ${k}`).join("\n")}

Next steps:
  reactjsquality-check911 scan     — index your components for Copilot
  reactjsquality-check911 hooks    — install pre-commit and pre-push git hooks
`);
};
