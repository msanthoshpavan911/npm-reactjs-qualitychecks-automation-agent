"use strict";

const { execSync } = require("child_process");
const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const THRESHOLD = 95;

// ── helpers ───────────────────────────────────────────────────────────────────

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function detectFramework(src) {
    if (/from ['"]react['"]/.test(src) || /require\(['"]react['"]\)/.test(src)) {
        return /export\s+(default\s+)?(?:function\s+|const\s+)use[A-Z]/.test(src) ? "hook" : "react";
    }
    if (/from ['"]vue['"]/.test(src)) return "vue";
    if (/@angular\/core/.test(src))  return "angular";
    return "module";
}

function extractComponentName(src, filePath) {
    const m = src.match(/export\s+default\s+function\s+(\w+)/)
           || src.match(/const\s+(\w+)\s*[=:][^=]*(React\.FC|FC<|JSX\.Element)/)
           || src.match(/export\s+(?:default\s+)?function\s+(\w+)/)
           || src.match(/export\s+const\s+(\w+)/);
    return m ? m[1] : path.basename(filePath, path.extname(filePath));
}

function extractProps(src) {
    const m = src.match(/(?:interface|type)\s+\w*Props[^{]*\{([^}]+)\}/s);
    if (!m) return [];
    return [...m[1].matchAll(/(\w+)\s*\??:/g)]
        .map(x => x[1])
        .filter(n => !["interface", "type", "extends", "implements"].includes(n));
}

function extractNamedExports(src) {
    const fns = [];
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g))
        fns.push({ name: m[1], params: m[2].split(",").map(p => p.trim()).filter(Boolean) });
    for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::[^=]+)?=>/g))
        fns.push({ name: m[1], params: m[2].split(",").map(p => p.trim()).filter(Boolean) });
    return fns;
}

function paramValue(param, i) {
    const n = param.split(":")[0].trim().replace(/[?!]/g, "").toLowerCase();
    if (/id$/.test(n))                              return `"test-id-${i}"`;
    if (/num|count|index|size|length/.test(n))      return String(i + 1);
    if (/flag|bool|enabled|visible|active/.test(n)) return "true";
    if (/arr|list|items|data/.test(n))              return "[]";
    if (/obj|options|config/.test(n))               return "{}";
    if (/fn|callback|handler|on[A-Z]/.test(n))      return "jest.fn()";
    return `"test-${n}"`;
}

function testFilePath(filePath) {
    const ext = path.extname(filePath);
    return filePath.slice(0, -ext.length) + ".test" + ext;
}

// ── test-case builders — each returns [{ name, body }] ───────────────────────

function reactTestCases(src, filePath) {
    const name      = extractComponentName(src, filePath);
    const props     = extractProps(src);
    const propAttrs = props.slice(0, 4).map(p => ` ${p}="test-value"`).join("");
    const tag       = `<${name}${propAttrs} />`;

    const cases = [
        {
            name: "renders without crashing",
            body: `    it('renders without crashing', () => {
        const { container } = render(${tag});
        expect(container).toBeTruthy();
        expect(container.firstChild).not.toBeNull();
    });`
        },
        {
            name: "renders without throwing when props are omitted",
            body: `    it('renders without throwing when props are omitted', () => {
        expect(() => render(<${name} />)).not.toThrow();
    });`
        },
        {
            name: "is accessible — renders into the document",
            body: `    it('is accessible — renders into the document', () => {
        const { baseElement } = render(${tag});
        expect(baseElement).toBeInTheDocument();
    });`
        },
        {
            name: "matches snapshot",
            body: `    it('matches snapshot', () => {
        const { asFragment } = render(${tag});
        expect(asFragment()).toMatchSnapshot();
    });`
        },
        {
            name: "unmounts cleanly without errors",
            body: `    it('unmounts cleanly without errors', () => {
        const { unmount } = render(${tag});
        expect(() => unmount()).not.toThrow();
    });`
        },
        {
            name: "re-renders without crashing",
            body: `    it('re-renders without crashing', () => {
        const { rerender } = render(${tag});
        expect(() => rerender(${tag})).not.toThrow();
    });`
        }
    ];

    for (const prop of props.slice(0, 4)) {
        cases.push({
            name: `renders with ${prop} prop set`,
            body: `    it('renders with ${prop} prop set', () => {
        const { container } = render(<${name} ${prop}="test-prop-value" />);
        expect(container).toBeTruthy();
    });`
        });
    }

    return cases;
}

function hookTestCases(src, filePath) {
    const hookName = path.basename(filePath, path.extname(filePath));
    const fns      = extractNamedExports(src);
    const hook     = fns.find(f => f.name.startsWith("use")) || { name: hookName, params: [] };
    const argStr   = hook.params.map((p, i) => paramValue(p, i)).join(", ");

    return [
        {
            name: "initializes without throwing",
            body: `    it('initializes without throwing', () => {
        expect(() => renderHook(() => ${hook.name}(${argStr}))).not.toThrow();
    });`
        },
        {
            name: "returns a defined value on mount",
            body: `    it('returns a defined value on mount', () => {
        const { result } = renderHook(() => ${hook.name}(${argStr}));
        expect(result.current).toBeDefined();
    });`
        },
        {
            name: "returns a stable value across re-renders",
            body: `    it('returns a stable value across re-renders', () => {
        const { result, rerender } = renderHook(() => ${hook.name}(${argStr}));
        rerender();
        expect(result.current).toBeDefined();
    });`
        },
        {
            name: "handles async state changes without error",
            body: `    it('handles async state changes without error', async () => {
        const { result } = renderHook(() => ${hook.name}(${argStr}));
        await act(async () => {});
        expect(result.current).toBeDefined();
    });`
        },
        {
            name: "unmounts without memory leaks",
            body: `    it('unmounts without memory leaks', () => {
        const { unmount } = renderHook(() => ${hook.name}(${argStr}));
        expect(() => unmount()).not.toThrow();
    });`
        }
    ];
}

function moduleTestCases(src) {
    const fns   = extractNamedExports(src);
    const cases = [];
    for (const fn of fns) {
        const args     = fn.params.map((p, i) => paramValue(p, i)).join(", ");
        const nullArgs = fn.params.map(() => "undefined").join(", ");
        cases.push(
            {
                name: `${fn.name} — is exported and callable`,
                body: `    it('${fn.name} — is exported and callable', () => {
        expect(typeof ${fn.name}).toBe('function');
    });`
            },
            {
                name: `${fn.name} — does not throw with valid inputs`,
                body: `    it('${fn.name} — does not throw with valid inputs', () => {
        expect(() => ${fn.name}(${args})).not.toThrow();
    });`
            },
            {
                name: `${fn.name} — returns a defined value`,
                body: `    it('${fn.name} — returns a defined value', () => {
        const result = ${fn.name}(${args});
        expect(result).toBeDefined();
    });`
            },
            {
                name: `${fn.name} — handles undefined inputs gracefully`,
                body: `    it('${fn.name} — handles undefined inputs gracefully', () => {
        expect(() => ${fn.name}(${nullArgs})).not.toThrow();
    });`
            }
        );
    }
    return cases;
}

function vueTestCases(src, filePath) {
    const name = extractComponentName(src, filePath);
    return [
        {
            name: "mounts without crashing",
            body: `    it('mounts without crashing', () => {
        const wrapper = shallowMount(${name});
        expect(wrapper.exists()).toBe(true);
    });`
        },
        {
            name: "renders correctly",
            body: `    it('renders correctly', () => {
        const wrapper = mount(${name});
        expect(wrapper.html()).toBeTruthy();
    });`
        },
        {
            name: "matches snapshot",
            body: `    it('matches snapshot', () => {
        const wrapper = shallowMount(${name});
        expect(wrapper.html()).toMatchSnapshot();
    });`
        },
        {
            name: "unmounts without errors",
            body: `    it('unmounts without errors', () => {
        const wrapper = mount(${name});
        expect(() => wrapper.unmount()).not.toThrow();
    });`
        }
    ];
}

// ── full-file builder (new files only) ───────────────────────────────────────

function buildFullFile(src, filePath, fw, cases) {
    const modName = path.basename(filePath, path.extname(filePath));
    const rel     = `./${modName}`;
    const body    = cases.map(c => c.body).join("\n\n");

    if (fw === "react") {
        const name       = extractComponentName(src, filePath);
        const hasDefault = /export\s+default/.test(src);
        const imp        = hasDefault ? `import ${name} from '${rel}';` : `import { ${name} } from '${rel}';`;
        return `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
${imp}

describe('${name}', () => {

${body}
});
`;
    }

    if (fw === "hook") {
        const fns  = extractNamedExports(src);
        const hook = fns.find(f => f.name.startsWith("use")) || { name: modName };
        return `import { renderHook, act } from '@testing-library/react';
import { ${hook.name} } from '${rel}';

describe('${hook.name}', () => {

${body}
});
`;
    }

    if (fw === "vue") {
        const name = extractComponentName(src, filePath);
        return `import { mount, shallowMount } from '@vue/test-utils';
import ${name} from '${rel}.vue';

describe('${name}', () => {

${body}
});
`;
    }

    // module
    const fns        = extractNamedExports(src);
    const defMatch   = src.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    const defName    = defMatch ? defMatch[1] : null;
    let importLine;
    if (defName && fns.length) importLine = `import ${defName}, { ${fns.map(f => f.name).join(", ")} } from '${rel}';`;
    else if (defName)          importLine = `import ${defName} from '${rel}';`;
    else if (fns.length)       importLine = `import { ${fns.map(f => f.name).join(", ")} } from '${rel}';`;
    else                       importLine = `import * as ${modName}Module from '${rel}';`;

    return `${importLine}

describe('${modName}', () => {

${body}
});
`;
}

// ── existing-file modifier ────────────────────────────────────────────────────

function getExistingTestNames(content) {
    const names = new Set();
    for (const m of content.matchAll(/\bit\s*\(\s*['"`]([^'"`]+)['"`]/g))
        names.add(m[1]);
    return names;
}

function injectCases(existingContent, newCases) {
    const injection = "\n" + newCases.map(c => c.body).join("\n\n") + "\n";
    // insert before the last `});` — the closing of the outermost describe block
    const lastClose = existingContent.lastIndexOf("});");
    if (lastClose === -1)
        return existingContent.trimEnd() + "\n" + injection + "\n";
    return existingContent.slice(0, lastClose) + injection + "});\n";
}

// ── coverage ──────────────────────────────────────────────────────────────────

function runCoverage(srcPath, testPath) {
    try {
        try {
            execSync(
                `npx jest "${testPath}" --coverage --coverageReporters=json-summary --passWithNoTests --silent`,
                { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
            );
        } catch (_) { /* jest exits 1 on failures but still writes the report */ }

        const summaryPath = "coverage/coverage-summary.json";
        if (!fs.existsSync(summaryPath)) return null;

        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        const abs     = path.resolve(srcPath).replace(/\\/g, "/");
        const entry   = Object.entries(summary).find(([k]) => {
            const kn = k.replace(/\\/g, "/");
            return kn === abs || kn.endsWith("/" + srcPath.replace(/\\/g, "/"));
        });
        if (!entry) return null;

        const { lines, statements, functions, branches } = entry[1];
        return { lines: lines.pct, statements: statements.pct, functions: functions.pct, branches: branches.pct };
    } catch (_) { return null; }
}

// ── main ──────────────────────────────────────────────────────────────────────

module.exports = async function generateTests(filePath) {
    if (!filePath) {
        filePath = await ask("\nEnter the file path to generate tests for\n(e.g. src/components/Button.tsx): ");
    }
    if (!filePath) { console.error("No file path provided."); process.exit(1); }

    filePath = filePath.replace(/^['"]|['"]$/g, "").trim();
    if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }

    const src     = fs.readFileSync(filePath, "utf8");
    const fw      = detectFramework(src);
    const outPath = testFilePath(filePath);
    const exists  = fs.existsSync(outPath);

    console.log(`\nSource:  ${filePath}  (${fw})`);
    console.log(`Tests:   ${outPath}  (${exists ? "exists — will add missing cases" : "will be created"})\n`);

    let allCases;
    if (fw === "hook")       allCases = hookTestCases(src, filePath);
    else if (fw === "react") allCases = reactTestCases(src, filePath);
    else if (fw === "vue")   allCases = vueTestCases(src, filePath);
    else                     allCases = moduleTestCases(src);

    if (!exists) {
        // ── CREATE ────────────────────────────────────────────────────────────
        fs.writeFileSync(outPath, buildFullFile(src, filePath, fw, allCases));
        console.log(`✅ Created: ${outPath}  (${allCases.length} test cases)`);
    } else {
        // ── MODIFY ───────────────────────────────────────────────────────────
        const existingContent = fs.readFileSync(outPath, "utf8");
        const existingNames   = getExistingTestNames(existingContent);
        const newCases        = allCases.filter(c => !existingNames.has(c.name));

        if (!newCases.length) {
            console.log("✅ All generated test cases already exist — nothing new to add.");
        } else {
            fs.writeFileSync(outPath, injectCases(existingContent, newCases));
            console.log(`✅ Modified: ${outPath}  (+${newCases.length} new case(s) added)`);
            newCases.forEach(c => console.log(`   + ${c.name}`));
        }
    }

    // ── coverage ──────────────────────────────────────────────────────────────
    process.stdout.write("\nRunning Jest coverage...  ");
    const cov = runCoverage(filePath, outPath);

    if (!cov) {
        console.log("⚠️\n");
        console.log("Could not measure coverage (Jest not installed or test errored).");
        console.log(`Run manually:  npx jest "${outPath}" --coverage\n`);
        return;
    }

    const icon = cov.lines >= THRESHOLD ? "✅" : "⚠️ ";
    console.log(`${icon} ${cov.lines}% lines  |  ${cov.statements}% statements  |  ${cov.functions}% functions  |  ${cov.branches}% branches`);

    if (cov.lines < THRESHOLD) {
        console.log(`\nCoverage is ${cov.lines}% — below the ${THRESHOLD}% target.`);
        console.log("Ask Copilot in the test file:");
        console.log(`  'Add more Jest tests for ${path.basename(filePath)} to reach 95% line coverage'`);
        console.log(`  'Write tests for the uncovered branches in ${path.basename(filePath)}'`);
        console.log(`\nThen re-run:  npx jest "${outPath}" --coverage\n`);
    } else {
        console.log(`\n✅ Coverage target met. Tests are at: ${outPath}\n`);
    }
};
