"use strict";

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const PRE_COMMIT = `#!/bin/sh
# reactjsquality-check911 — pre-commit hook
# Runs ESLint and Jest coverage on staged files (changed chunks only)

set -e

if ! command -v reactjsquality-check911 >/dev/null 2>&1; then
  echo "reactjsquality-check911 not found — run: npm install -g reactjsquality-check911"
  exit 0
fi

CONFIG=".reactjs-quality-agent.json"
if [ ! -f "$CONFIG" ]; then
  echo "No $CONFIG found — run: reactjsquality-check911 init"
  exit 0
fi

reactjsquality-check911 quality
reactjsquality-check911 coverage
`;

const PRE_PUSH = `#!/bin/sh
# reactjsquality-check911 — pre-push hook
# Runs Playwright smoke tests and npm audit before every push

set -e

if ! command -v reactjsquality-check911 >/dev/null 2>&1; then
  echo "reactjsquality-check911 not found — run: npm install -g reactjsquality-check911"
  exit 0
fi

CONFIG=".reactjs-quality-agent.json"
if [ ! -f "$CONFIG" ]; then
  echo "No $CONFIG found — run: reactjsquality-check911 init"
  exit 0
fi

reactjsquality-check911 playwright
reactjsquality-check911 audit
`;

module.exports = function hooks() {
    fs.mkdirSync(".githooks", { recursive: true });

    fs.writeFileSync(".githooks/pre-commit", PRE_COMMIT);
    fs.chmodSync(".githooks/pre-commit", 0o755);
    console.log("✅ .githooks/pre-commit created  (ESLint + Jest coverage on staged files)");

    fs.writeFileSync(".githooks/pre-push", PRE_PUSH);
    fs.chmodSync(".githooks/pre-push", 0o755);
    console.log("✅ .githooks/pre-push created    (Playwright smoke tests before every push)");

    try {
        execSync("git config core.hooksPath .githooks", { stdio: "pipe" });
        console.log("✅ git configured to use .githooks/");
    } catch (_) {
        console.log("⚠️  Could not set core.hooksPath — run manually: git config core.hooksPath .githooks");
    }

    console.log(`
Hooks installed. From now on:

  git commit  →  ESLint errors block the commit (changed chunks only)
                 Code Smells (SonarJS) block the commit  [if enabled]
                 Security violations block the commit    [if enabled]
                 Jest coverage < 80% blocks the commit   [if enabled]

  git push    →  Playwright smoke tests must pass        [if enabled]
                 npm audit for high/critical CVEs         [if enabled]
`);
};
