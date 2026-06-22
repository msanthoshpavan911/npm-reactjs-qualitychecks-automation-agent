import os
import re
from pathlib import Path

SRC_EXTS  = (".js", ".jsx", ".ts", ".tsx")
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"}


def walk(root):
    files = []
    if not os.path.exists(root):
        return files
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in filenames:
            if fname.endswith(SRC_EXTS):
                files.append(os.path.join(dirpath, fname))
    return files


def component_scanner() -> str:
    src_dirs = ["src", "app", "pages", "components", "hooks", "services", "stores", "lib"]
    all_files = []
    for d in src_dirs:
        all_files.extend(walk(d))

    if not all_files:
        return "No source files found. Run from the project root."

    summary = []
    for f in all_files[:60]:  # cap to avoid huge responses
        fp   = f.replace("\\", "/")
        name = os.path.basename(f)
        try:
            src = Path(f).read_text(encoding="utf-8")
        except Exception:
            continue
        exports = re.findall(r'export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+(\w+)', src)
        api_calls = re.findall(r'(?:fetch|axios\.(?:get|post|put|delete|patch))\s*\(\s*[\'"`]([^\'"`]+)[\'"`]', src)
        line = f"- {fp}"
        if exports:
            line += f" — exports: {', '.join(exports[:4])}"
        if api_calls:
            line += f" — calls: {', '.join(api_calls[:3])}"
        summary.append(line)

    return "## Project File Index\n\n" + "\n".join(summary)
