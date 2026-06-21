import os
import re
import subprocess
from pathlib import Path


def get_staged_files():
    r = subprocess.run(["git", "diff", "--cached", "--name-only"],
                       capture_output=True, text=True)
    return [f.strip() for f in r.stdout.splitlines()
            if f.strip().endswith((".js", ".jsx", ".ts", ".tsx"))
            and os.path.exists(f.strip())]


def find_existing_tests():
    tests = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", "dist", ".next"}]
        for f in files:
            if f.endswith(".spec.ts") or f.endswith(".spec.js"):
                tests.append(os.path.join(root, f).replace("\\", "/"))
    return tests[:5]


def playwright_helper() -> str:
    staged   = get_staged_files()
    existing = find_existing_tests()

    pages = [f for f in staged if "page" in f.lower() or "pages/" in f.replace("\\", "/")]

    existing_sample = ""
    if existing:
        try:
            sample = Path(existing[0]).read_text(encoding="utf-8")[:1000]
            existing_sample = f"\n## Existing Test Pattern (from {existing[0]})\n```ts\n{sample}\n```\n"
        except Exception:
            pass

    targets = pages or staged
    target_list = "\n".join(f"- {f}" for f in targets)

    return f"""Generate Playwright E2E tests for the following pages/components.

## Files to Test
{target_list}
{existing_sample}
## Instructions
- Use TypeScript + `@playwright/test`
- File naming: `tests/{{page-name}}.spec.ts`
- Use the Page Object Model pattern — create a class per page
- Cover:
  1. Happy path — the main user flow works end to end
  2. Form validation — required fields, error messages shown correctly
  3. Navigation — correct URL after actions
  4. Error states — API failure, empty state, 404
- Assertions: `expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveURL()`
- Use `page.getByRole()`, `page.getByLabel()`, `page.getByTestId()` — not CSS selectors
- Run with: `npx playwright test`

## Example Page Object Pattern
```ts
import {{ Page, expect }} from '@playwright/test';

export class LoginPage {{
  constructor(private page: Page) {{}}

  async goto() {{ await this.page.goto('/login'); }}
  async login(email: string, password: string) {{
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', {{ name: 'Sign in' }}).click();
  }}
  async expectError(message: string) {{
    await expect(this.page.getByRole('alert')).toHaveText(message);
  }}
}}
```
"""
