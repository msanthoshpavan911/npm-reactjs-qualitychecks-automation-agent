---
name: React Frontend Quality Agent
description: >
  A GitHub Copilot agent for React/TypeScript projects that enforces code quality
  on every git commit — runs ESLint, Jest + React Testing Library coverage (95%),
  Playwright E2E tests, and npm security audit automatically via git hooks.
  Integrates with GitHub Copilot and Claude to auto-generate missing tests when
  none exist, and uses Playwright MCP to browse the actual running app and write
  accurate E2E specs.
tags:
  - react
  - typescript
  - eslint
  - jest
  - playwright
  - mcp
  - git-hooks
  - code-quality
  - copilot
  - testing
  - security-audit
  - react-testing-library
---

# React Frontend Quality Agent

## What this skill does

Installs a pre-commit git hook that automatically enforces the following quality
checks on every `git commit` in a React/TypeScript project:

| Check | What it enforces |
|---|---|
| **ESLint** | Code style errors on changed lines only — not the whole file |
| **Code Smells** | SonarJS: cognitive complexity, duplicate code, dead code |
| **Security** | eslint-security: eval, unsafe regex, object injection, CSRF |
| **Jest Coverage** | 95% line coverage per changed file — auto-generates tests via AI if missing |
| **Playwright E2E** | Component-specific smoke tests — auto-generates via Playwright MCP |
| **npm Audit** | Blocks high/critical CVEs before they reach the repo |

When a check fails, the agent uses **GitHub Copilot** or **Claude CLI** to
auto-generate or improve the missing tests, then re-runs the check — only
blocking the commit if AI-assisted fixes also fail.

---

## When to use this skill

- Starting a new React or TypeScript project and want quality gates from day one
- Onboarding a team onto consistent code quality standards
- Client engagements where test coverage and security compliance are required
- Any React project where developers are committing untested or low-quality code

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | >= 18.0.0 |
| Git | Any recent version |
| VS Code | >= 1.99 (for Playwright MCP support) |
| GitHub Copilot | Existing licence — no extra cost |
| Python | For MCP server (auto-configured) |

---

## How to use

### Step 1 — Install the package globally

```bash
npm install -g reactjsquality-check911
```

### Step 2 — Run setup in your React project root

```bash
cd your-react-project
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
> Press Enter to enable all (recommended).

### Step 3 — Install git hooks

```bash
reactjsquality-check911 hooks
```

### Step 4 — (Optional) Index your codebase for Copilot

```bash
reactjsquality-check911 scan
```

---

## What happens on every `git commit`

```
git commit
    │
    ▼
ESLint + TypeScript  →  fail: shows violations, asks Copilot to fix
    │ pass
    ▼
Jest Coverage 95%    →  fail: auto-generates tests via Claude/Copilot, retries
    │ pass
    ▼
Playwright E2E       →  fail: generates component-specific spec via Playwright MCP
    │ pass
    ▼
npm audit            →  fail: shows CVEs, suggests npm audit fix
    │ pass
    ▼
commit saved ✅
```

---

## AI capabilities

| Scenario | What the agent does |
|---|---|
| No test file for a staged component | Generates Jest + RTL tests via Claude or Copilot CLI |
| Coverage below 95% | Asks AI to add more test cases, retries up to 2 times |
| No Playwright spec for a staged page | Generates component-specific spec (not a generic smoke file) |
| Playwright not installed | Auto-installs `@playwright/test` and Chromium |
| No `playwright.config` | Auto-creates config detecting CRA (port 3000) vs Vite (port 5173) |

---

## MCP tools available in Copilot Chat

After running `init`, these tools are available in VS Code Copilot Chat:

| Tool | Ask Copilot |
|---|---|
| `fix` | "Fix the quality violations in my staged files" |
| `generate_tests` | "Generate Jest tests for my staged files" |
| `scan` | "Index my components" |
| `playwright_setup` | "Generate Playwright tests for my pages" |
| `read_file` | "Read src/components/Button.tsx" |
| `playwright` (MCP) | "Navigate to /dashboard and write a Playwright test" |

---

## npm package

```
Package : reactjsquality-check911
Registry: https://www.npmjs.com/package/reactjsquality-check911
License : MIT
Author  : mamidi-santhosh
```

---

## Capability category

**Delivery transformation** — enforces code quality, test coverage, and security
standards on React client projects, reducing technical debt and audit risk.
