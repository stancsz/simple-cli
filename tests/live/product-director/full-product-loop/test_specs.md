# Live Test Specification: Full Product Cycle (CLI Tool)

## 1. Test Overview

**Objective**: Validate the entire product development lifecycle orchestrated by the Product Director, from conception to MVP.
**Category**: Full Product Cycle
**Complexity**: High
**Status**: Experimental (Requires Agent Expansion)

## 2. Environment Setup

- **Directory**: `examples/product-director`
- **Agents Required**: Market Researcher, UX Designer, [Software Engineer], [QA Engineer]
- **Pre-requisites**:
  - Full system capability.
  - Access to code generation tools (e.g., GitHub Copilot CLI).

## 3. Test Steps

1.  **Launch CLI**: Start the `simple-cli` in the `examples/product-director` directory.
2.  **Input Command**:
    ```text
    Build a simple CLI tool called 'weather-cli' that fetches weather data for a given city using a public API. Start with market research, then design, then implement.
    ```
3.  **Wait for Execution**: Allow the Product Director orchestration to delegate tasks sequentially or in parallel.
4.  **Verify Orchestration Log**:
    - [ ] Phase 1: Market Research completed.
    - [ ] Phase 2: Design completed.
    - [ ] Phase 3: Implementation initiated.

## 4. Success Criteria

- [ ] **Artifact Creation**:
  - [ ] `reports/market_research.md` (Weather APIs comparison).
  - [ ] `design/wireframes.md` (CLI output format).
  - [ ] `src/weather_cli.ts` (Implementation).
  - [ ] `test/weather_cli.test.ts` (Test case).
- [ ] **Functional Check**:
  - [ ] Running `ts-node src/weather_cli.ts "London"` outputs weather data.
- [ ] **Error Check**: Clean execution across all phases.

## 5. Cleaning Up

- Clean `reports/`, `design/`, `src/`, `test/` directories related to `weather-cli`.
