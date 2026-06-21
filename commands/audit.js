"use strict";

const { execSync } = require("child_process");
const fs = require("fs");

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(".reactjs-quality-agent.json", "utf8")); } catch (_) { return null; }
}

module.exports = function audit() {
    const config = loadConfig();
    if (!config) {
        console.log("No .reactjs-quality-agent.json found — skipping audit.");
        return;
    }
    if (!config.checks || !config.checks.vulnerabilities) {
        return; // not opted in — silent skip
    }

    process.stdout.write("Running npm audit...          ");
    try {
        let auditOutput = "";
        let hasVulns    = false;
        try {
            execSync("npm audit --audit-level=high --json", {
                encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
            });
        } catch (e) {
            // npm audit exits 1 when vulnerabilities found — stdout still has JSON
            auditOutput = e.stdout || "{}";
            hasVulns    = true;
        }

        if (!hasVulns) {
            console.log("✅");
            return;
        }

        let high = 0, critical = 0;
        try {
            const data = JSON.parse(auditOutput);
            if (data.metadata && data.metadata.vulnerabilities) {
                // npm v7+
                high     = data.metadata.vulnerabilities.high     || 0;
                critical = data.metadata.vulnerabilities.critical  || 0;
            } else if (data.vulnerabilities) {
                // npm v6
                for (const v of Object.values(data.vulnerabilities)) {
                    if (v.severity === "critical") critical++;
                    else if (v.severity === "high") high++;
                }
            }
        } catch (_) {}

        console.log("❌");
        console.log(`  ${critical} critical, ${high} high severity vulnerabilities in dependencies`);
        console.log("  Fix: npm audit fix          — auto-fix compatible updates");
        console.log("       npm audit fix --force  — force upgrades (may include breaking changes)");
        console.log("       npm audit              — see full vulnerability details");
        process.exit(1);
    } catch (e) {
        console.log("⚠️  npm audit unavailable:", e.message.slice(0, 80));
    }
};
