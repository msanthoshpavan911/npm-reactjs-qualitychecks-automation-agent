# reactjsquality-check911

A developer CLI that enforces code quality and test coverage on your React/TypeScript projects — automatically, on every commit.

- Runs **ESLint**, **SonarJS code smells**, and **security checks** on staged files before every commit
- Enforces **95% Jest line coverage** on changed files before every commit
- Configures **GitHub Copilot** with a full Jest test generation workflow — just ask in Agent mode
- Configures an **MCP server** so Copilot can navigate and fix your project directly
- Works as a **git pre-commit hook** — no CI changes required

---

## What it does

Every `git commit` automatically runs all enabled checks in sequence:

```
git commit -m "your message"
        │
        ▼
  ┌─────────────┐   fail → shows ESLint/TypeScript errors → fix & re-stage
  │   quality   │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail → shows coverage % per file → use Copilot Agent mode
  │  coverage   │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail → runs Playwright tests → fix failing specs
  │ playwright  │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail → shows CVE count → run npm audit fix
  │    audit    │
  └──────┬──────┘
         │ all pass
         ▼
     commit saved ✅
```

---

## Requirements

- Node.js >= 18.0.0
- Git
- Python (for MCP server)
- VS Code + GitHub Copilot (for AI-assisted test generation)

---

## Installation

```bash
npm install -g reactjsquality-check911
```

---

## Setup (First Time)

### Step 1 — Initialize your project

```bash
reactjsquality-check911 init
```

Select which quality checks to enable:

```
1. ESLint          — code style and error rules on staged chunks
2. Code Smells     — SonarJS: cognitive complexity, duplicate code, dead code
3. Vulnerabilities — eslint-security + npm audit CVE scan on commit
4. Coverage        — Jest line coverage (95% threshold per changed file)
5. Playwright      — E2E smoke tests run before every git commit
```

> Press **Enter** to enable all checks (recommended).

**Files created by `init`:**

| File | Purpose |
|---|---|
| `.reactjs-quality-agent.json` | Your project's quality configuration |
| `.github/copilot-instructions.md` | Full Jest test generation workflow + React guidelines for Copilot |
| `.vscode/mcp.json` | Connects MCP server to VS Code Copilot Chat |
| `docs/architecture.md` | Stub — populated by the `scan` command |
| `docs/component-index.md` | Stub — populated by the `scan` command |

### Step 2 — Install git hooks

```bash
reactjsquality-check911 hooks
```

### Step 3 — (Optional) Scan your codebase

```bash
reactjsquality-check911 scan
```

---

## Generating Jest Tests with 95% Coverage

After running `init`, `.github/copilot-instructions.md` contains a full step-by-step Jest test generation workflow. VS Code Copilot reads this file automatically in Agent mode.

### How to use

**Step 1** — Open Copilot Chat in VS Code (`Ctrl+Alt+I`)

**Step 2** — Click the mode dropdown at the bottom-left of the chat input and select **Agent**

**Step 3** — Type:
```
Generate Jest tests for Button with 95% coverage
```

No file attachment needed. Copilot finds the file itself.

### What Copilot does automatically

1. **Finds** the source file using terminal (`dir /s /b "Button.tsx"`)
2. **Reads** the file and detects its type (React component / hook / utility module)
3. **Generates** a complete Jest test file using the correct pattern:
   - React components → `@testing-library/react` with render, interaction, snapshot, and accessibility tests
   - Hooks → `renderHook` + `act` from `@testing-library/react`
   - Utility modules → plain Jest function tests
4. **Writes** the test file alongside the source (`Button.tsx` → `Button.test.tsx`)
5. **Runs** `npx jest "<testFile>" --coverage --coverageReporters=json-summary`
6. **Reads** `coverage/coverage-summary.json` and checks `lines.pct`
7. **Iterates** up to 5 times — adds tests for uncovered branches, rewrites the file, re-runs Jest
8. **Stops** when line coverage ≥ 95% and reports the result

### What the generated tests look like

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {

    it('renders without crashing', () => {
        const { container } = render(<Button label="Click me" />);
        expect(container.firstChild).not.toBeNull();
    });

    it('matches snapshot', () => {
        const { asFragment } = render(<Button label="Click me" />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('calls onClick when clicked', async () => {
        const handleClick = jest.fn();
        render(<Button label="Click me" onClick={handleClick} />);
        await userEvent.click(screen.getByRole('button'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('is disabled when disabled prop is true', () => {
        render(<Button label="Click me" disabled />);
        expect(screen.getByRole('button')).toBeDisabled();
    });

});
```

### Final report

```
✅ Button.tsx — 97.5% line coverage (2 iterations)
Test file: src/components/Button.test.tsx
Test cases created: 7
```

---

## Using GitHub Copilot to Fix Violations

After `init`, VS Code Copilot Chat gets access to MCP tools via `.vscode/mcp.json`. Open Copilot Chat (`Ctrl+Alt+I`), switch to **Agent** mode, and use these prompts:

| What you type | What it does |
|---|---|
| `Generate Jest tests for ComponentName with 95% coverage` | Finds file, generates tests, runs Jest, iterates until 95% |
| `Fix the quality violations in my staged files` | Runs ESLint/SonarJS on staged files — returns violations + fixes |
| `Index my components` | Rebuilds `docs/component-index.md` for Copilot context |

### What Copilot knows about your project

Because `init` wrote `.github/copilot-instructions.md`, Copilot always behaves as a **Senior React Engineer** that:

- Generates Jest tests using `@testing-library/react` (never Enzyme)
- Targets 95% minimum line coverage
- Uses `userEvent` for interactions
- Queries by role/text/testId — never CSS class or id
- Fixes ESLint and TypeScript violations

---

## Quick Reference

```bash
# First time setup
npm install -g reactjsquality-check911
reactjsquality-check911 init
reactjsquality-check911 hooks
reactjsquality-check911 scan

# Run checks manually
reactjsquality-check911 quality
reactjsquality-check911 coverage
reactjsquality-check911 playwright
reactjsquality-check911 audit

# Skip hooks for a specific commit (use sparingly)
git commit --no-verify -m "your message"
```

---

## Commands

### `init`
First-time project setup. Selects quality checks and creates all config files including the Copilot instructions with the full Jest test generation workflow.

### `quality`
Runs ESLint, SonarJS, eslint-security, and TypeScript type checking on **only the lines you changed** in staged files.

**If it fails:** Ask Copilot (Agent mode) — `Fix the quality violations in my staged files`

### `coverage`
Runs Jest on the test file for each staged source file and verifies line coverage meets the 95% threshold.

Test file resolution order:
1. `Button.test.tsx` alongside `Button.tsx`
2. `Button.spec.tsx`
3. `__tests__/Button.test.tsx`

**If it fails:** Ask Copilot (Agent mode) — `Generate Jest tests for Button with 95% coverage`

**Prerequisites:**
```bash
npm install -D jest @testing-library/react @testing-library/user-event
```

### `playwright`
Runs `npx playwright test` against your E2E test files.

**Prerequisites:**
```bash
npm install -D @playwright/test
npx playwright install
npx playwright init
```

### `audit`
Runs `npm audit` and blocks the commit if any **high** or **critical** severity CVEs are found.

**If it fails:**
```bash
npm audit fix
npm audit fix --force
```

### `scan`
Analyzes the codebase and generates `docs/architecture.md` and `docs/component-index.md` for Copilot context.

### `hooks`
Installs the pre-commit git hook. Runs: `quality` → `coverage` → `playwright` → `audit`.

---

## Configuration

All checks read from `.reactjs-quality-agent.json`:

```json
{
  "checks": {
    "eslint": true,
    "codesmells": true,
    "vulnerabilities": true,
    "coverage": true,
    "playwright": true
  }
}
```

Set any check to `false` to disable it.

### Thresholds

| Check | Threshold |
|---|---|
| ESLint | Any error blocks |
| Code Smells (cognitive complexity) | 15 |
| Jest coverage | 95% per changed file |
| npm audit | High + Critical only |
| Playwright | All tests must pass |

---

## Troubleshooting

### Pre-commit hook not running
```bash
ls -la .githooks/pre-commit
git config core.hooksPath        # should output: .githooks
reactjsquality-check911 hooks    # re-install if missing
```

### `.reactjs-quality-agent.json` not found
```bash
reactjsquality-check911 init
```

### ESLint not installed
```bash
npm install eslint eslint-plugin-sonarjs eslint-plugin-security
```

### Coverage below 95%
Ask Copilot in Agent mode:
```
Generate Jest tests for ComponentName with 95% coverage
```

### Playwright skipped with warning
```bash
npm install -D @playwright/test
npx playwright install
npx playwright init
```

---

## Upgrading

```bash
npm install -g reactjsquality-check911@latest
reactjsquality-check911 init
reactjsquality-check911 hooks
```

---

## License

MIT — [mamidi-santhosh](https://www.npmjs.com/~mamidi-santhosh)
