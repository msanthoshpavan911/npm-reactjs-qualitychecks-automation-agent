# reactjsquality-check911

A GitHub Copilot agent for React/TypeScript projects that enforces ESLint, Jest + React Testing Library coverage, Playwright E2E tests, and npm security audit on every `git commit` — with AI-assisted test generation via Claude and GitHub Copilot.

---

## What it does

Every `git commit` automatically runs all enabled quality checks in sequence:

```
git commit -m "your message"
        │
        ▼
  ┌─────────────┐   fail → shows ESLint/TypeScript errors → fix & re-stage
  │   quality   │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail → shows coverage % per file → add tests
  │  coverage   │
  └──────┬──────┘
         │ pass
         ▼
  ┌─────────────┐   fail → runs AI generation (Claude/Copilot) or shows guide
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

---

## Installation

```bash
npm install -g reactjsquality-check911
```

During installation, the Python MCP server dependency (`fastmcp`) is installed automatically via `pip`.

---

## Setup (First Time)

### Step 1 — Initialize your project

Navigate to your frontend project root and run:

```bash
reactjsquality-check911 init
```

You will be asked to select which quality checks to enable:

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
| `.github/copilot-instructions.md` | AI instructions for Copilot (test generation + fix guidelines) |
| `.vscode/mcp.json` | Connects MCP server to VS Code Copilot Chat |
| `docs/architecture.md` | Stub — populated by the `scan` command |
| `docs/component-index.md` | Stub — populated by the `scan` command |

### Step 2 — Install git hooks

```bash
reactjsquality-check911 hooks
```

This creates `.githooks/pre-commit` and configures git to use it:

```bash
git config core.hooksPath .githooks
```

From this point, every `git commit` automatically runs all 4 quality checks.

### Step 3 — (Optional) Scan your codebase

```bash
reactjsquality-check911 scan
```

Walks your `src/`, `app/`, `pages/`, `components/`, `hooks/`, `services/`, and `stores/` directories and generates:

- `docs/architecture.md` — detailed breakdown with routes, props, API calls per component, and an ASCII layer diagram
- `docs/component-index.md` — flat component index used by Copilot Chat for context

Run this whenever you add new components to keep Copilot's context up to date.

---

## Quick Reference

```bash
# First time setup
npm install -g reactjsquality-check911
reactjsquality-check911 init
reactjsquality-check911 hooks
reactjsquality-check911 scan

# Run checks manually (same as what the hook runs)
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

First-time project setup. Interactively selects the framework and quality checks, then writes all configuration files.

```bash
reactjsquality-check911 init
```

### `quality`

Runs ESLint, SonarJS code smell detection, eslint-security, and TypeScript type checking on **only the lines you changed** in staged files — not the entire file.

```bash
reactjsquality-check911 quality
```

**What it checks:**
- ESLint rule violations (errors block commit; warnings display but allow commit)
- Code smells via SonarJS: cognitive complexity > 15, duplicate strings, identical functions, empty/unused collections, redundant boolean logic
- Security issues via eslint-security: `eval()`, unsafe regex, non-literal `require()`, object injection, timing attacks, CSRF
- TypeScript type errors on `.ts`/`.tsx` files

**If it fails:** Ask Copilot Chat — *"Fix the quality violations in my staged files"*. The MCP `fix` tool automatically provides the exact violations and changed code chunks to Copilot.

### `coverage`

Runs Jest on the test file corresponding to each staged source file and verifies line coverage meets the 95% threshold.

```bash
reactjsquality-check911 coverage
```

**How test files are resolved (in order):**
1. `Button.test.tsx` alongside `Button.tsx`
2. `Button.spec.tsx`
3. `__tests__/Button.test.tsx`

**If it fails:** Ask Copilot Chat — *"Generate Jest tests to reach 95% coverage for my changed files"*. The MCP `generate_tests` tool provides the file content, detected props, and framework-specific instructions to Copilot.

**Prerequisites:**
```bash
npm install -D jest @testing-library/react @testing-library/user-event
```

### `playwright`

Runs `npx playwright test` against your E2E test files. If no test files are found, it attempts to auto-generate them using AI before running.

```bash
reactjsquality-check911 playwright
```

**AI generation order (when no tests exist):**
1. Tries **Claude CLI** (`claude`) if available
2. Falls back to **GitHub Copilot CLI** (`gh copilot suggest`)
3. If neither is available, prints step-by-step instructions to generate via Copilot Chat or claude.ai

**If tests fail:** Run `npx playwright test` locally to debug, or ask Copilot Chat — *"Fix the failing Playwright tests"*.

**Prerequisites:**
```bash
npm install -D @playwright/test
npx playwright install
npx playwright init    # creates playwright.config.ts
```

### `audit`

Runs `npm audit` and blocks the commit if any **high** or **critical** severity CVEs are found. Low and medium severity issues are reported but do not block.

```bash
reactjsquality-check911 audit
```

**If it fails:**
```bash
npm audit fix           # auto-fix compatible updates
npm audit fix --force   # force upgrades (review carefully — may introduce breaking changes)
npm audit               # view full vulnerability details
```

### `scan`

Analyzes the entire codebase and generates documentation under `docs/`.

```bash
reactjsquality-check911 scan
```

**What it produces:**

`docs/architecture.md`:
- Summary table of components, pages, hooks, services, stores
- Per-page: route path and API calls
- Per-component: props, custom hooks used, API calls
- Per-service: exported functions and endpoints
- ASCII diagram of application layers

`docs/component-index.md`:
- Flat categorized list of every source file (good for search and Copilot context)

### `hooks`

Installs the pre-commit git hook that runs all quality checks on every `git commit`.

```bash
reactjsquality-check911 hooks
```

**What gets installed:**

`.githooks/pre-commit` runs in sequence:
1. `reactjsquality-check911 quality`
2. `reactjsquality-check911 coverage`
3. `reactjsquality-check911 playwright`
4. `reactjsquality-check911 audit`

Git is configured to use `.githooks/` via:
```bash
git config core.hooksPath .githooks
```

> Commit `.githooks/pre-commit` to your repository so all teammates get the same hooks.

---

## Configuration

All checks read from `.reactjs-quality-agent.json` at the project root:

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

Set any check to `false` to disable it — it will silently skip during the pre-commit hook without blocking your commit.

### Thresholds

| Check | Threshold | Configurable |
|---|---|---|
| ESLint | Any error blocks | Via your project's `.eslintrc` |
| Code Smells (cognitive complexity) | 15 | Edit `config/sonarjs.eslintrc.json` |
| Code Smells (duplicate strings) | 3 occurrences | Edit `config/sonarjs.eslintrc.json` |
| Jest coverage | 95% per changed file | No |
| npm audit | High + Critical only | No |
| Playwright | All tests must pass | No |
| TypeScript | Any error blocks | Via your `tsconfig.json` |

---

## MCP Server (Copilot Chat Integration)

After running `init`, VS Code Copilot Chat gets access to these tools automatically via `.vscode/mcp.json`:

| Tool | Ask Copilot |
|---|---|
| `fix` | *"Fix the quality violations in my staged files"* |
| `generate_tests` | *"Generate Jest tests for my staged files"* |
| `scan` | *"Index my components"* |
| `playwright_setup` | *"Generate Playwright tests for my pages"* |
| `read_file` | *"Read src/components/Button.tsx"* |
| `ping` | *"Is the MCP server working?"* |

The MCP server runs as a local stdio process (`mcp-server/server.py`). It reads your staged files, extracts violations and context, and feeds structured prompts to Copilot so it can generate accurate fixes and tests without you having to copy-paste code manually.

**If the MCP server is not connecting:**
1. Verify `.vscode/mcp.json` exists (run `init` again if missing)
2. Test manually: `python mcp-server/server.py`
3. Check that `pip install fastmcp` succeeded during install

---

## Troubleshooting

### Pre-commit hook not running
```bash
# Verify the hook file exists and is executable
ls -la .githooks/pre-commit

# Verify git is using the hooks directory
git config core.hooksPath
# Should output: .githooks

# Test the hook manually
.githooks/pre-commit
```

### `.reactjs-quality-agent.json` not found
```bash
reactjsquality-check911 init
```

### ESLint not installed
```bash
npm install eslint eslint-plugin-sonarjs eslint-plugin-security
```

### Playwright skipped with warning
```bash
npm install -D @playwright/test
npx playwright install
npx playwright init
```

### Coverage below 95%
- Check that the test file is being detected (watch for `⚠️ no test file found` warnings)
- Verify `coverage/coverage-summary.json` is being generated by Jest
- Add more test cases covering the changed lines

### `reactjsquality-check911` not found after install
```bash
# Check it's on your PATH
npm list -g reactjsquality-check911

# Re-install if needed
npm install -g reactjsquality-check911
```

---

## License

MIT — [mamidi-santhosh](https://www.npmjs.com/~mamidi-santhosh)
