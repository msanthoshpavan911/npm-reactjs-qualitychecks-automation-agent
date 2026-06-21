import os
from fastmcp import FastMCP
from tools.code_fixer import code_fixer
from tools.test_generator import test_generator
from tools.component_scanner import component_scanner
from tools.playwright_helper import playwright_helper

mcp = FastMCP("ReactJS Quality Agent")

@mcp.tool()
def ping():
    return "MCP Working"

@mcp.tool()
def fix():
    """
    Get everything needed to fix staged files in one pass:
    file contents + ESLint violations + fix instructions.
    Call this when the user asks to fix quality issues in staged files.
    """
    return code_fixer()

@mcp.tool()
def generate_tests():
    """
    Generate Jest tests for staged or recently changed source files.
    Call this when the user asks to generate tests, add test coverage,
    or write unit tests.
    """
    return test_generator()

@mcp.tool()
def scan():
    """
    Scan the project and return a structured index of components, pages,
    hooks, services, and stores. Use this first to navigate the codebase.
    """
    return component_scanner()

@mcp.tool()
def playwright_setup():
    """
    Return Playwright test generation instructions and existing test patterns
    for the current project. Use this when the user asks to generate
    Playwright / E2E tests for a page or user flow.
    """
    return playwright_helper()

@mcp.tool()
def read_file(path: str) -> str:
    """
    Read a specific source file by path.
    Use scan() first to find the path, then call this.
    """
    if not os.path.exists(path):
        return f"File not found: {path}"
    with open(path, encoding="utf-8") as f:
        return f.read()

if __name__ == "__main__":
    mcp.run()
