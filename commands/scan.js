"use strict";

const fs   = require("fs");
const path = require("path");

function readFile(f) { try { return fs.readFileSync(f, "utf8"); } catch (_) { return ""; } }

const SRC_EXTS = /\.(js|jsx|ts|tsx)$/;

// ── file walkers ──────────────────────────────────────────────────────────────

function walk(dir, buckets) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (/node_modules|\.git|dist|build|\.next|coverage|\.cache/.test(entry.name)) continue;
            walk(full, buckets);
        } else if (SRC_EXTS.test(entry.name)) {
            classify(full, entry.name, buckets);
        }
    }
}

function classify(full, name, buckets) {
    if (name.includes(".test.") || name.includes(".spec.") || full.includes("__tests__")) {
        buckets.tests.push(full); return;
    }
    const src = readFile(full);
    if (/\bplaywright\b|test\.describe|test\.it|test\(/.test(src) && !src.includes("export default")) {
        buckets.e2e.push(full); return;
    }
    if (/pages\/|app\/.*page\.(js|jsx|ts|tsx)$|routes\//.test(full.replace(/\\/g, "/"))) {
        buckets.pages.push(full); return;
    }
    if (/hooks\/|use[A-Z]\w+\.(js|jsx|ts|tsx)$/.test(full.replace(/\\/g, "/"))) {
        buckets.hooks.push(full); return;
    }
    if (/context\/|provider\/|Context\.(js|jsx|ts|tsx)$|Provider\.(js|jsx|ts|tsx)$/.test(full.replace(/\\/g, "/"))) {
        buckets.contexts.push(full); return;
    }
    if (/services\/|api\/|client\/|\.service\.(js|ts)$/.test(full.replace(/\\/g, "/"))) {
        buckets.services.push(full); return;
    }
    if (/store\/|slice\/|reducer\/|\.slice\.(js|ts)$|\.store\.(js|ts)$/.test(full.replace(/\\/g, "/"))) {
        buckets.stores.push(full); return;
    }
    if (/utils\/|helpers\/|lib\/|\.util\.(js|ts)$|\.helper\.(js|ts)$/.test(full.replace(/\\/g, "/"))) {
        buckets.utils.push(full); return;
    }
    if (src.includes("export default") && (src.includes("return (") || src.includes("=> ("))) {
        buckets.components.push(full); return;
    }
    buckets.other.push(full);
}

// ── component analysis ────────────────────────────────────────────────────────

function extractComponentName(src, filePath) {
    const m = /(?:export default function|const|function)\s+([A-Z]\w+)/.exec(src);
    return m ? m[1] : path.basename(filePath, path.extname(filePath));
}

function extractProps(src) {
    const m = /(?:interface|type)\s+\w*Props\s*[={]([^}]+)}/s.exec(src);
    if (!m) return [];
    return (m[1].match(/(\w+)\s*[?:]?\s*:/g) || []).map(p => p.replace(/[?:]/g, "").trim()).slice(0, 8);
}

function extractHookDeps(src) {
    const deps = new Set();
    const re = /use([A-Z]\w+)\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const hook = "use" + m[1];
        if (!["useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext", "useReducer"].includes(hook))
            deps.add(hook);
    }
    return [...deps].slice(0, 5);
}

function extractApiCalls(src) {
    const calls = [];
    const re = /(?:fetch|axios\.(?:get|post|put|delete|patch))\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(src)) !== null) calls.push(m[1]);
    return [...new Set(calls)].slice(0, 5);
}

function extractRoutes(src, filePath) {
    const fp = filePath.replace(/\\/g, "/");
    const routeM = /pages\/(.+?)\.(js|jsx|ts|tsx)$/.exec(fp) || /app\/(.+?)\/page\.(js|jsx|ts|tsx)$/.exec(fp);
    return routeM ? "/" + routeM[1].replace(/\/index$/, "").replace(/\[(\w+)\]/, ":$1") : null;
}

// ── markdown builders ─────────────────────────────────────────────────────────

function buildComponentIndex(buckets) {
    const rel = f => f.replace(/\\/g, "/");
    let md = "# Component Index\n\n";

    const sections = [
        ["Pages / Routes",    buckets.pages],
        ["Components",        buckets.components],
        ["Custom Hooks",      buckets.hooks],
        ["State / Stores",    buckets.stores],
        ["Contexts",          buckets.contexts],
        ["Services / API",    buckets.services],
        ["Utilities",         buckets.utils],
        ["Tests (Unit)",      buckets.tests],
        ["Tests (E2E)",       buckets.e2e],
    ];

    for (const [title, files] of sections) {
        if (!files.length) continue;
        md += `## ${title}\n`;
        files.forEach(f => (md += `- [${path.basename(f)}](${rel(f)})\n`));
        md += "\n";
    }
    return md;
}

function buildArchitecture(buckets) {
    let md = "# Frontend Architecture\n\n";

    // Overview
    md += "## Overview\n\n";
    md += `| | |\n|---|---|\n`;
    md += `| **Pages / Routes** | ${buckets.pages.length} |\n`;
    md += `| **Components** | ${buckets.components.length} |\n`;
    md += `| **Custom Hooks** | ${buckets.hooks.length} |\n`;
    md += `| **State / Stores** | ${buckets.stores.length} |\n`;
    md += `| **Services / API** | ${buckets.services.length} |\n`;
    md += `| **Unit Tests** | ${buckets.tests.length} |\n`;
    md += `| **E2E Tests** | ${buckets.e2e.length} |\n\n`;

    // Pages
    if (buckets.pages.length) {
        md += "---\n\n## Pages / Routes\n\n";
        for (const f of buckets.pages) {
            const src   = readFile(f);
            const name  = extractComponentName(src, f);
            const route = extractRoutes(src, f);
            const apis  = extractApiCalls(src);
            md += `### ${name}\n\n`;
            if (route) md += `**Route**: \`${route}\`  \n`;
            md += `**File**: \`${f.replace(/\\/g, "/")}\`  \n`;
            if (apis.length) md += `**API calls**: ${apis.map(a => `\`${a}\``).join(", ")}  \n`;
            md += "\n";
        }
    }

    // Components
    if (buckets.components.length) {
        md += "---\n\n## Components\n\n";
        for (const f of buckets.components) {
            const src   = readFile(f);
            const name  = extractComponentName(src, f);
            const props = extractProps(src);
            const hooks = extractHookDeps(src);
            const apis  = extractApiCalls(src);

            md += `### ${name}\n\n`;
            md += `**File**: \`${f.replace(/\\/g, "/")}\`  \n`;
            if (props.length) md += `**Props**: ${props.map(p => `\`${p}\``).join(", ")}  \n`;
            if (hooks.length) md += `**Uses hooks**: ${hooks.join(", ")}  \n`;
            if (apis.length)  md += `**Fetches**: ${apis.map(a => `\`${a}\``).join(", ")}  \n`;
            md += "\n";
        }
    }

    // Custom Hooks
    if (buckets.hooks.length) {
        md += "---\n\n## Custom Hooks\n\n";
        for (const f of buckets.hooks) {
            const src  = readFile(f);
            const name = path.basename(f, path.extname(f));
            const apis = extractApiCalls(src);
            md += `### ${name}\n\n`;
            md += `**File**: \`${f.replace(/\\/g, "/")}\`  \n`;
            if (apis.length) md += `**API calls**: ${apis.map(a => `\`${a}\``).join(", ")}  \n`;
            md += "\n";
        }
    }

    // Services
    if (buckets.services.length) {
        md += "---\n\n## Services / API Layer\n\n";
        for (const f of buckets.services) {
            const src  = readFile(f);
            const name = path.basename(f, path.extname(f));
            const apis = extractApiCalls(src);
            const fns  = [...(src.matchAll(/export (?:async )?function (\w+)|export const (\w+)\s*=/g) || [])]
                         .map(m => m[1] || m[2]).filter(Boolean).slice(0, 8);
            md += `### ${name}\n\n`;
            md += `**File**: \`${f.replace(/\\/g, "/")}\`  \n`;
            if (fns.length)  md += `**Exports**: ${fns.map(n => `\`${n}()\``).join(", ")}  \n`;
            if (apis.length) md += `**Endpoints**: ${apis.map(a => `\`${a}\``).join(", ")}  \n`;
            md += "\n";
        }
    }

    // Stores
    if (buckets.stores.length) {
        md += "---\n\n## State / Stores\n\n";
        for (const f of buckets.stores) {
            const name = path.basename(f, path.extname(f));
            md += `### ${name}\n\n`;
            md += `**File**: \`${f.replace(/\\/g, "/")}\`  \n\n`;
        }
    }

    // Layer diagram
    md += "---\n\n## Application Layers\n\n```\n";
    md += "Browser / User\n    │\n    ▼\n";
    if (buckets.pages.length)    md += "Pages / Routes        ← Next.js routing or React Router\n    │\n    ▼\n";
    if (buckets.components.length) md += "Components            ← UI building blocks\n    │\n    ▼\n";
    if (buckets.hooks.length)    md += "Custom Hooks          ← shared stateful logic\n    │\n    ▼\n";
    if (buckets.stores.length)   md += "State / Stores        ← global state (Redux / Zustand / Pinia)\n    │\n    ▼\n";
    if (buckets.services.length) md += "Services / API Layer  ← HTTP calls to backend\n    │\n    ▼\n";
    md += "Backend API\n```\n";

    return md;
}

module.exports = function scan() {
    const buckets = {
        pages: [], components: [], hooks: [], contexts: [],
        stores: [], services: [], utils: [], tests: [], e2e: [], other: []
    };

    console.log("Scanning repository...");
    const srcDirs = ["src", "app", "pages", "components", "hooks", "services", "stores", "lib"];
    for (const dir of srcDirs) walk(dir, buckets);

    fs.mkdirSync("docs", { recursive: true });

    fs.writeFileSync("docs/component-index.md", buildComponentIndex(buckets));
    console.log("docs/component-index.md updated");

    fs.writeFileSync("docs/architecture.md", buildArchitecture(buckets));
    console.log("docs/architecture.md updated");
};
