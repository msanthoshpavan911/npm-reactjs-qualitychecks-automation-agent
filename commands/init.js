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

const COPILOT_INSTRUCTIONS = `# React Quality Agent

You are a Senior React Engineer embedded in this repository.

## Your Responsibilities
- Generate Jest + React Testing Library tests for every component and hook
- Fix ESLint and TypeScript violations in staged files
- Ensure 95% Jest line coverage on changed files
- Generate Playwright tests for new pages and user flows

## Quality Standards
- ESLint: react/recommended + typescript-eslint/recommended
- No unused variables, no console.log in production code, no implicit \`any\`
- Jest: 95% minimum line coverage on changed files
- Playwright: all smoke tests must pass before every commit

---

## Jest Test Generation — Automated Workflow

When the user asks to generate Jest tests for any file, execute ALL steps below autonomously.
Do NOT stop and ask for the file — find it yourself using the terminal.

### Step 1 — Find and read the source file

Run in terminal (Windows):
\`\`\`
dir /s /b "ComponentName.tsx" 2>nul
\`\`\`
Or (Mac/Linux):
\`\`\`
find . -name "ComponentName.tsx" -not -path "*/node_modules/*" -not -path "*/.test.*"
\`\`\`
Then read it:
\`\`\`
type src\\components\\ComponentName.tsx
\`\`\`

### Step 2 — Detect file type

| Source content | Type |
|---|---|
| import React / JSX syntax | React component |
| export function use[A-Z] | React hook |
| Plain TS/JS functions, no framework imports | Utility module |

### Step 3 — Generate a complete test file

Test path: same directory, add \`.test.\` before the extension.
- \`src/components/Button.tsx\` → \`src/components/Button.test.tsx\`
- \`src/hooks/useAuth.ts\` → \`src/hooks/useAuth.test.ts\`

**For React components:**
\`\`\`tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComponentName from './ComponentName';

describe('ComponentName', () => {
  it('renders without crashing', () => {
    const { container } = render(<ComponentName />);
    expect(container.firstChild).not.toBeNull();
  });
  it('matches snapshot', () => {
    const { asFragment } = render(<ComponentName />);
    expect(asFragment()).toMatchSnapshot();
  });
  it('calls onClick when clicked', async () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
\`\`\`

**For React hooks:**
\`\`\`ts
import { renderHook, act } from '@testing-library/react';
import { useHookName } from './useHookName';

describe('useHookName', () => {
  it('initializes without throwing', () => {
    expect(() => renderHook(() => useHookName())).not.toThrow();
  });
  it('returns a defined value on mount', () => {
    const { result } = renderHook(() => useHookName());
    expect(result.current).toBeDefined();
  });
});
\`\`\`

**For utility modules:**
\`\`\`ts
import { fnName } from './utils';
describe('fnName', () => {
  it('is exported and callable', () => { expect(typeof fnName).toBe('function'); });
  it('returns expected value', () => { expect(fnName('input')).toBeDefined(); });
  it('handles null/undefined without throwing', () => { expect(() => fnName(null)).not.toThrow(); });
});
\`\`\`

### Step 4 — Write the test file

Write the complete test file using the editFiles tool.

### Step 5 — Run Jest and measure coverage

\`\`\`
npx jest "testFilePath" --coverage --coverageReporters=json-summary --passWithNoTests --silent
\`\`\`
Then read:
\`\`\`
type coverage\\coverage-summary.json
\`\`\`
Target: \`lines.pct >= 95\`

### Step 6 — Iterate until 95%+ (up to 5 rounds)

1. Read back the test file with terminal
2. Add tests for every uncovered branch (else paths, error states, prop variations, async paths)
3. Rewrite the FULL test file (never partial patches)
4. Re-run Jest and re-read coverage-summary.json
5. Stop when lines.pct >= 95

### Non-negotiable rules
- ALWAYS write the full test file on each iteration
- ALWAYS use @testing-library/react (not Enzyme)
- ALWAYS use userEvent for interactions
- NEVER query by CSS class or id — use getByRole, getByText, getByTestId
- NEVER leave .only or .skip on tests
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
    const mcpServers = {
        "reactjs-quality-agent": {
            type: "stdio",
            command: "python",
            args: [mcpServerPath],
            env: {}
        }
    };

    // Add Playwright MCP server if playwright check is enabled
    if (checks.playwright) {
        mcpServers["playwright"] = {
            type: "stdio",
            command: "npx",
            args: ["@playwright/mcp@latest"],
            env: {}
        };
    }

    fs.writeFileSync(".vscode/mcp.json", JSON.stringify({ servers: mcpServers }, null, 2));
    console.log("✅ .vscode/mcp.json configured");
    if (checks.playwright) {
        console.log("✅ Playwright MCP server added — Copilot can now browse your app and generate tests");
    }

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

How to generate Jest tests with 95% coverage:
  1. Open Copilot Chat  (Ctrl+Alt+I)
  2. Switch to 'Agent' mode (dropdown at bottom-left of chat input)
  3. Type: Generate Jest tests for <ComponentName> with 95% coverage
     Copilot finds the file, writes tests, runs Jest, and iterates automatically.

Next steps:
  reactjsquality-check911 scan     — index your components for Copilot
  reactjsquality-check911 hooks    — install pre-commit git hook
`);
};
