import os
import re
import subprocess
from pathlib import Path

SRC_EXTS = (".js", ".jsx", ".ts", ".tsx", ".vue")


def get_staged_files():
    r = subprocess.run(["git", "diff", "--cached", "--name-only"],
                       capture_output=True, text=True)
    return [
        f.strip() for f in r.stdout.splitlines()
        if f.strip().endswith(SRC_EXTS)
        and not any(x in f for x in (".test.", ".spec.", "__tests__"))
        and os.path.exists(f.strip())
    ]


def infer_framework(src: str) -> str:
    if "from 'react'" in src or 'from "react"' in src:
        return "react"
    if "from 'vue'" in src or 'from "vue"' in src:
        return "vue"
    if "@angular/core" in src:
        return "angular"
    return "vanilla"


def extract_exports(src: str) -> list:
    exports = []
    for m in re.finditer(r'export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+(\w+)', src):
        exports.append(m.group(1))
    return list(dict.fromkeys(exports))  # deduplicate preserving order


def extract_props(src: str) -> list:
    m = re.search(r'(?:interface|type)\s+\w*Props\s*[={]([^}]+)}', src, re.DOTALL)
    if not m:
        return []
    return re.findall(r'(\w+)\s*[?:]', m.group(1))[:6]


def test_generator() -> str:
    staged = get_staged_files()
    if not staged:
        return "No staged source files found. Stage your files with `git add` first."

    output_parts = []

    for f in staged:
        src       = Path(f).read_text(encoding="utf-8")
        framework = infer_framework(src)
        exports   = extract_exports(src)
        props     = extract_props(src)
        fname     = os.path.basename(f)
        name      = fname.rsplit(".", 1)[0]
        test_file = f.rsplit(".", 1)[0] + ".test." + ("tsx" if f.endswith(".tsx") else "ts" if f.endswith(".ts") else "jsx" if f.endswith(".jsx") else "js")

        if framework == "react":
            prompt = f"""Generate Jest + React Testing Library tests for `{fname}`.

File: {f}
Exports: {', '.join(exports) if exports else name}
Props: {', '.join(props) if props else 'none detected'}

## Source
```tsx
{src[:3000]}
```

## Instructions
- Test file: `{test_file}`
- Import from: `@testing-library/react` + `@testing-library/user-event`
- Cover: renders correctly, prop variations, user interactions, error/loading states
- Method naming: `should {{expected}} when {{condition}}`
- Mock fetch/axios calls with `jest.fn()`
- Use `screen.getByRole`, `getByText`, `getByTestId` — no class/id selectors
- Run with: `npx jest {test_file} --coverage`
"""
        elif framework == "vue":
            prompt = f"""Generate Jest + Vue Test Utils tests for `{fname}`.

File: {f}
Exports: {', '.join(exports) if exports else name}

## Source
```vue
{src[:3000]}
```

## Instructions
- Test file: `{test_file}`
- Import from: `@vue/test-utils`
- Use `mount` for full rendering, `shallowMount` for unit isolation
- Cover: props, emits, slots, computed values, user interactions
- Mock Pinia stores with `createTestingPinia()`
"""
        else:
            prompt = f"""Generate Jest tests for `{fname}`.

File: {f}
Exports: {', '.join(exports) if exports else name}

## Source
```ts
{src[:3000]}
```

## Instructions
- Test file: `{test_file}`
- Cover: all exported functions — happy path, edge cases, exceptions
- Mock dependencies with `jest.fn()` and `jest.spyOn()`
- Method naming: `should {{expected}} when {{condition}}`
"""

        output_parts.append(prompt)

    return "\n\n---\n\n".join(output_parts)
