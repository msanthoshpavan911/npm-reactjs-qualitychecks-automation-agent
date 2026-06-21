"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs   = require("fs");

const serverPath = path.join(__dirname, "..", "mcp-server", "server.py");

// Install Python dependencies silently
try {
    const req = path.join(__dirname, "..", "mcp-server", "requirements.txt");
    if (fs.existsSync(req)) {
        execSync(`pip install -r "${req}" -q`, { stdio: "pipe" });
    }
} catch (_) {}

console.log("reactjsquality-check911 installed.");
console.log("Run `reactjsquality-check911 init` inside your React/JS project to get started.");
