import json
import os
import re
import subprocess
from pathlib import Path

SRC_EXTS = (".js", ".jsx", ".ts", ".tsx")


def get_staged_files():
    r = subprocess.run(["git", "diff", "--cached", "--name-only"],
                       capture_output=True, text=True)
    return [f.strip() for f in r.stdout.splitlines()
            if f.strip().endswith(SRC_EXTS) and os.path.exists(f.strip())]


def get_changed_line_ranges() -> dict:
    r = subprocess.run(["git", "diff", "--cached", "--unified=0"],
                       capture_output=True, text=True)
    ranges: dict = {}
    cur = None
    for line in r.stdout.splitlines():
        fm = re.match(r'^\+\+\+ b/(.+)$', line)
        if fm:
            cur = fm.group(1)
            ranges.setdefault(cur, [])
            continue
        if line.startswith("+++ /dev/null"):
            cur = None
            continue
        hm = re.match(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', line)
        if hm and cur:
            start = int(hm.group(1))
            count = int(hm.group(2)) if hm.group(2) is not None else 1
            if count > 0:
                ranges[cur].append([start, start + count - 1])
    return ranges


def _find_ranges(abs_path: str, changed_ranges: dict):
    norm = abs_path.replace("\\", "/").lower()
    for git_path, ranges in changed_ranges.items():
        gn = git_path.lower()
        if norm == gn or norm.endswith("/" + gn):
            return ranges
    return None


def _in_range(line_num: int, ranges) -> bool:
    if not ranges:
        return False
    return any(s <= line_num <= e for s, e in ranges)


def run_eslint(files: list) -> list:
    """Run ESLint with JSON reporter and return raw results."""
    try:
        result = subprocess.run(
            ["npx", "eslint"] + files + ["--format", "json"],
            capture_output=True, text=True
        )
        return json.loads(result.stdout or "[]")
    except Exception:
        return []


def code_fixer() -> str:
    staged = get_staged_files()
    if not staged:
        return "No staged JS/TS files found. Run `git add <files>` first."

    changed_ranges = get_changed_line_ranges()

    # Run ESLint
    eslint_results = run_eslint(staged)

    # Filter to changed chunks only
    violations = []
    for file_result in eslint_results:
        fpath     = file_result.get("filePath", "")
        ranges    = _find_ranges(fpath, changed_ranges)
        if ranges is None:
            continue
        fname = os.path.basename(fpath)
        for msg in file_result.get("messages", []):
            if not _in_range(msg.get("line", 0), ranges):
                continue
            severity = "error" if msg.get("severity") == 2 else "warning"
            rule     = msg.get("ruleId") or "unknown"
            line     = msg.get("line", "?")
            text     = msg.get("message", "")
            violations.append(f"  [ESLint:{rule}] {fname}:{line} — {text} ({severity})")

    if not violations:
        return "No ESLint violations in your changed lines — nothing to fix."

    # Read changed chunks only
    chunks_text = ""
    for f in staged:
        git_path    = f.replace("\\", "/")
        file_ranges = changed_ranges.get(git_path) or next(
            (rng for gp, rng in changed_ranges.items()
             if gp.lower().endswith("/" + git_path.lower().split("/")[-1])),
            None
        )
        lines  = Path(f).read_text(encoding="utf-8").splitlines()
        chunks = []
        if file_ranges:
            for start, end in file_ranges:
                chunk_lines = lines[start - 1: end]
                chunks.append(f"Lines {start}–{end}:\n" + "\n".join(chunk_lines))
        chunks_text += f"\n### {f}\n" + "\n\n".join(chunks) + "\n"

    violations_text = "\n".join(violations)

    return f"""You are a Senior React/TypeScript Engineer. Fix ONLY the ESLint violations listed below.
They are all within the changed chunks of the current commit — do not touch any other lines.

## Changed Chunks
{chunks_text}

## ESLint Violations in Changed Lines
{violations_text}

## Instructions
1. Fix every ESLint error (unused variables, missing return types, console.log, any types)
2. Fix every TypeScript violation (implicit any, missing types, strict mode issues)
3. Change ONLY the lines reported above — do not reformat or refactor anything else
4. Return the corrected chunks showing the fixed lines with their line numbers
"""
