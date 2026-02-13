# Live Test Specification: AI-Powered Code Assistant (Market Research)

## 1. Test Overview

**Objective**: Validate the "Market Researcher" agent capability by generating a comprehensive market analysis for a new AI coding tool.
**Category**: Market Research
**Complexity**: Medium

## 2. Environment Setup

- **Directory**: `examples/product-director`
- **Agents Required**: Market Researcher
- **Pre-requisites**:
  - `mcp.json` configured with web search tool (e.g., Brave Search or Google Search).
  - Network access enabled.

## 3. Test Steps

1.  **Launch CLI**: Start the `simple-cli` in the `examples/product-director` directory.
2.  **Input Command**:
    ```text
    Research the current market for AI-powered code completion tools, focusing on VS Code extensions. Identify top 3 competitors and their pricing models.
    ```
3.  **Wait for Execution**: Allow the agent to perform web searches and synthesize findings.
4.  **Verify Output**: Check for the creation of `reports/market_research.md`.

## 4. Success Criteria

- [ ] **Artifact Creation**: `reports/market_research.md` exists.
- [ ] **Content Validation**:
  - [ ] Contains "SWOT Analysis" section.
  - [ ] Mentions at least 3 competitors (e.g., GitHub Copilot, Tabnine, Codeium).
  - [ ] Includes pricing information.
- [ ] **Error Check**: No critical errors in `logs/session.log`.

## 5. Cleaning Up

- Delete `reports/market_research.md` before next run.
