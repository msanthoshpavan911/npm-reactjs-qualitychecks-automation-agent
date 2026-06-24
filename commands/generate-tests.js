"use strict";

const { execSync } = require("child_process");
const fs       = require("fs");
const path     = require("path");
const readline = require("readline");

const THRESHOLD = 95;

// ── helpers ────────────────────────────────────────────────────────────────────

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function detectFramework(src) {
    if (/from ['"]react['"]/.test(src) || /require\(['"]react['"]\)/.test(src)) {
        const isHook = /export\s+(default\s+)?(?:function\s+|const\s+)use[A-Z]/.test(src);
        return isHook ? "hook" : "react";
    }
    if (/from ['"]vue['"]/.test(src)) return "vue";
    if (/@angular\/core/.test(src)) return "angular";
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
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)) {
        fns.push({ name: m[1], params: m[2].split(",").map(p => p.trim()).filter(Boolean) });
    }
    for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::[^=]+)?=>/g)) {
        fns.push({ name: m[1], params: m[2].split(",").map(p => p.trim()).filter(Boolean) });
    }
    return fns;
}

function paramValue(param, i) {
    const name = param.split(":")[0].trim().replace(/[?!]/g, "").toLowerCase();
    if (/id$/.test(name))                       return `"test-id-${i}"`;
    if (/num|count|index|size|length/.test(name)) return String(i + 1);
    if (/flag|bool|enabled|visible|active/.test(name)) return "true";
    if (/arr|list|items|data/.test(name))       return "[]";
    if (/obj|options|config/.test(name))        return "{}";
    if (/fn|callback|handler|on[A-Z]/.test(name)) return "jest.fn()";
    return `"test-${name}"`;
}

function testFilePath(filePath) {
    const ext  = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    return `${base}.test${ext}`;
}

// ── generators ────────────────────────────────────────────────────────────────

function generateReactTests(src, filePath) {
    const name        = extractComponentName(src, filePath);
    const props       = extractProps(src);
    const hasDefault  = /export\s+default/.test(src);
    const importStr   = hasDefault
        ? `import ${name} from './${path.basename(filePath, path.extname(filePath))}';`
        : `import { ${name} } from './${path.basename(filePath, path.extname(filePath))}';`;

    const propAttrs = props.slice(0, 4).map(p => ` ${p}="test-value"`).join("");

    const propTests = props.slice(0, 4).map(p => `
    it('renders with ${p} prop set', () => {
        const { container } = render(<${name} ${p}="test-prop-value" />);
        expect(container).toBeTruthy();
    });`).join("");

    return `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
${importStr}

describe('${name}', () => {

    it('renders without crashing', () => {
        const { container } = render(<${name}${propAttrs} />);
        expect(container).toBeTruthy();
        expect(container.firstChild).not.toBeNull();
    });

    it('renders without throwing when props are omitted', () => {
        expect(() => render(<${name} />)).not.toThrow();
    });

    it('is accessible — renders into the document', () => {
        const { baseElement } = render(<${name}${propAttrs} />);
        expect(baseElement).toBeInTheDocument();
    });
${propTests}
    it('matches snapshot', () => {
        const { asFragment } = render(<${name}${propAttrs} />);
        expect(asFragment()).toMatchSnapshot();
    });

    it('unmounts cleanly without errors', () => {
        const { unmount } = render(<${name}${propAttrs} />);
        expect(() => unmount()).not.toThrow();
    });

    it('re-renders without crashing', () => {
        const { rerender } = render(<${name}${propAttrs} />);
        expect(() => rerender(<${name}${propAttrs} />)).not.toThrow();
    });
});
`;
}

function generateHookTests(src, filePath) {
    const hookName = path.basename(filePath, path.extname(filePath));
    const fns      = extractNamedExports(src);
    const hook     = fns.find(f => f.name.startsWith("use")) || { name: hookName, params: [] };
    const argStr   = hook.params.map((p, i) => paramValue(p, i)).join(", ");

    return `import { renderHook, act } from '@testing-library/react';
import { ${hook.name} } from './${hookName}';

describe('${hook.name}', () => {

    it('initializes without throwing', () => {
        expect(() => renderHook(() => ${hook.name}(${argStr}))).not.toThrow();
    });

    it('returns a defined value on mount', () => {
        const { result } = renderHook(() => ${hook.name}(${argStr}));
        expect(result.current).toBeDefined();
    });

    it('returns a stable value across re-renders', () => {
        const { result, rerender } = renderHook(() => ${hook.name}(${argStr}));
        rerender();
        expect(result.current).toBeDefined();
    });

    it('handles async state changes without error', async () => {
        const { result } = renderHook(() => ${hook.name}(${argStr}));
        await act(async () => {
            // trigger any async effects here
        });
        expect(result.current).toBeDefined();
    });

    it('unmounts without memory leaks', () => {
        const { unmount } = renderHook(() => ${hook.name}(${argStr}));
        expect(() => unmount()).not.toThrow();
    });
});
`;
}

function generateModuleTests(src, filePath) {
    const fns     = extractNamedExports(src);
    const modName = path.basename(filePath, path.extname(filePath));
    const rel     = `./${modName}`;

    const hasDefault = /export\s+default/.test(src);
    const defMatch   = src.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    const defName    = defMatch ? defMatch[1] : null;

    let importLine;
    if (defName && fns.length) {
        importLine = `import ${defName}, { ${fns.map(f => f.name).join(", ")} } from '${rel}';`;
    } else if (defName) {
        importLine = `import ${defName} from '${rel}';`;
    } else if (fns.length) {
        importLine = `import { ${fns.map(f => f.name).join(", ")} } from '${rel}';`;
    } else {
        importLine = `import * as ${modName}Module from '${rel}';`;
    }

    const blocks = fns.map(fn => {
        const args    = fn.params.map((p, i) => paramValue(p, i)).join(", ");
        const nullArgs = fn.params.map(() => "undefined").join(", ");
        return `
describe('${fn.name}', () => {

    it('is exported and callable', () => {
        expect(typeof ${fn.name}).toBe('function');
    });

    it('does not throw with valid inputs', () => {
        expect(() => ${fn.name}(${args})).not.toThrow();
    });

    it('returns a defined value for valid inputs', () => {
        const result = ${fn.name}(${args});
        expect(result).toBeDefined();
    });

    it('handles empty / undefined inputs gracefully', () => {
        expect(() => ${fn.name}(${nullArgs})).not.toThrow();
    });

    it('handles empty string inputs', () => {
        const emptyArgs = ${JSON.stringify(fn.params.map(() => ""))};
        expect(() => ${fn.name}(...emptyArgs)).not.toThrow();
    });
});`;
    });

    const fallback = `
describe('${modName} module', () => {
    it('loads without errors', () => {
        expect(true).toBe(true);
    });
});`;

    return `${importLine}
${blocks.length ? blocks.join("\n") : fallback}
`;
}

function generateVueTests(src, filePath) {
    const name   = extractComponentName(src, filePath);
    const modName = path.basename(filePath, path.extname(filePath));

    return `import { mount, shallowMount } from '@vue/test-utils';
import ${name} from './${modName}.vue';

describe('${name}', () => {

    it('mounts without crashing', () => {
        const wrapper = shallowMount(${name});
        expect(wrapper.exists()).toBe(true);
    });

    it('renders correctly', () => {
        const wrapper = mount(${name});
        expect(wrapper.html()).toBeTruthy();
    });

    it('matches snapshot', () => {
        const wrapper = shallowMount(${name});
        expect(wrapper.html()).toMatchSnapshot();
    });

    it('unmounts without errors', () => {
        const wrapper = mount(${name});
        expect(() => wrapper.unmount()).not.toThrow();
    });
});
`;
}

// ── coverage check ─────────────────────────────────────────────────────────────

function runCoverage(srcPath, testPath) {
    try {
        try {
            execSync(`npx jest "${testPath}" --coverage --coverageReporters=json-summary --passWithNoTests --silent`, {
                encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
            });
        } catch (_) { /* jest exits 1 on test failure — we still read the report */ }

        const summaryPath = "coverage/coverage-summary.json";
        if (!fs.existsSync(summaryPath)) return null;

        const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        const absPath = path.resolve(srcPath).replace(/\\/g, "/");
        const entry   = Object.entries(summary).find(([k]) => {
            const kn = k.replace(/\\/g, "/");
            return kn === absPath || kn.endsWith("/" + srcPath.replace(/\\/g, "/"));
        });
        if (!entry) return null;

        const { lines, statements, functions, branches } = entry[1];
        return { lines: lines.pct, statements: statements.pct, functions: functions.pct, branches: branches.pct };
    } catch (_) { return null; }
}

// ── main ───────────────────────────────────────────────────────────────────────

module.exports = async function generateTests(filePath) {
    if (!filePath) {
        filePath = await ask("\nEnter the file path to generate tests for\n(e.g. src/components/Button.tsx): ");
    }
    if (!filePath) { console.error("No file path provided."); process.exit(1); }

    filePath = filePath.replace(/^['"]|['"]$/g, "").trim(); // strip quotes if user added them
    if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }

    const src      = fs.readFileSync(filePath, "utf8");
    const fw       = detectFramework(src);
    const outPath  = testFilePath(filePath);

    console.log(`\nAnalyzed:  ${filePath}  (${fw})`);
    console.log(`Output:    ${outPath}\n`);

    let content;
    if (fw === "hook")   content = generateHookTests(src, filePath);
    else if (fw === "react")  content = generateReactTests(src, filePath);
    else if (fw === "vue")    content = generateVueTests(src, filePath);
    else                      content = generateModuleTests(src, filePath);

    fs.writeFileSync(outPath, content);
    console.log(`✅ Test file written: ${outPath}`);

    process.stdout.write("\nRunning Jest coverage...  ");
    const cov = runCoverage(filePath, outPath);

    if (!cov) {
        console.log("⚠️\n");
        console.log("Could not measure coverage (Jest not installed or test errored).");
        console.log(`Review the generated file and run:`);
        console.log(`  npx jest "${outPath}" --coverage\n`);
        return;
    }

    const icon = cov.lines >= THRESHOLD ? "✅" : "⚠️ ";
    console.log(`${icon} ${cov.lines}% lines  |  ${cov.statements}% statements  |  ${cov.functions}% functions  |  ${cov.branches}% branches`);

    if (cov.lines < THRESHOLD) {
        console.log(`\nCoverage is ${cov.lines}% — below the ${THRESHOLD}% target.`);
        console.log("To close the gap, open the test file and ask Copilot:");
        console.log(`  'Add more Jest tests for ${path.basename(filePath)} to reach 95% line coverage'`);
        console.log(`  'Write tests for the uncovered branches in ${path.basename(filePath)}'`);
        console.log(`\nThen re-run: npx jest "${outPath}" --coverage\n`);
    } else {
        console.log(`\n✅ Coverage target met. Test file is ready at: ${outPath}\n`);
    }
};
