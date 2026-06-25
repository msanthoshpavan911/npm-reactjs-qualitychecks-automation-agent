#!/usr/bin/env node
"use strict";

const { program } = require("commander");

program
    .name("reactjsquality-check911")
    .description("React/JS quality agent — ESLint, Jest coverage, Playwright on every commit.\nRun 'init' to configure the Jest Coverage Expert Copilot agent for automated test generation to 95% coverage.")
    .version(require("../package.json").version);

program
    .command("init")
    .description("Choose framework and quality checks, configure Copilot and MCP")
    .action(() => require("../commands/init")());

program
    .command("quality")
    .description("Run ESLint and TypeScript check on staged files (changed chunks only)")
    .action(() => require("../commands/quality")());

program
    .command("coverage")
    .description("Run Jest coverage on staged/changed files (80% threshold per file)")
    .action(() => require("../commands/coverage")());

program
    .command("playwright")
    .description("Run Playwright smoke tests against the current build")
    .action(() => require("../commands/playwright")());

program
    .command("scan")
    .description("Scan components, pages, and services — rebuild architecture.md")
    .action(() => require("../commands/scan")());

program
    .command("audit")
    .description("Run npm audit for high/critical CVEs (only if vulnerabilities check is enabled)")
    .action(() => require("../commands/audit")());

program
    .command("hooks")
    .description("Install pre-commit git hook (ESLint + coverage + Playwright + audit)")
    .action(() => require("../commands/hooks")());

program.parse(process.argv);
