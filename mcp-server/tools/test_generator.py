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
        src     = Path(f).read_text(encoding="utf-8")
        exports = extract_exports(src)
        props   = extract_props(src)
        fname   = os.path.basename(f)
        ext     = "tsx" if f.endswith(".tsx") else "ts" if f.endswith(".ts") else "jsx" if f.endswith(".jsx") else "js"
        test_file = f.rsplit(".", 1)[0] + f".test.{ext}"

        prompt = f"""Generate Jest tests for `{fname}`.

File: {f}
Exports: {', '.join(exports) if exports else fname.rsplit('.', 1)[0]}
Props: {', '.join(props) if props else 'none detected'}

## Source
```ts
{src[:3000]}
```

## Instructions
- Test file: `{test_file}`
- Cover: all exports — renders correctly, prop variations, user interactions, error and loading states
- Method naming: `should {{expected}} when {{condition}}`
- Mock fetch/axios/API calls with `jest.fn()`
- Use `screen.getByRole`, `getByText`, `getByTestId` — avoid class/id selectors
- Run with: `npx jest {test_file} --coverage`
"""
        output_parts.append(prompt)

    return "\n\n---\n\n".join(output_parts)
