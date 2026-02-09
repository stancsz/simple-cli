# Live Test Specification: Personal Finance Dashboard (UX Design)

## 1. Test Overview
**Objective**: Validate the "UX Designer" agent capability by creating a wireframe for a personal finance application.
**Category**: UX Design
**Complexity**: Medium

## 2. Environment Setup
- **Directory**: `examples/product-director`
- **Agents Required**: UX Designer
- **Pre-requisites**: None specific beyond base setup.

## 3. Test Steps
1.  **Launch CLI**: Start the `simple-cli` in the `examples/product-director` directory.
2.  **Input Command**:
    ```text
    Design a wireframe for a Personal Finance Dashboard. Include sections for "Account Balance", "Recent Transactions", and "Monthly Budget Progress".
    ```
3.  **Wait for Execution**: Allow the agent to generate the design.
4.  **Verify Output**: Check for the creation of `design/wireframes.md` (or output in console if file not specified).

## 4. Success Criteria
- [ ] **Artifact Creation**: `design/wireframes.md` exists.
- [ ] **Content Validation**:
    - [ ] Contains a Mermaid diagram or ASCII art representing the dashboard.
    - [ ] Includes "Account Balance", "Transactions", and "Budget" sections.
    - [ ] Structure is logical and user-friendly.
- [ ] **Error Check**: No critical errors in `logs/session.log`.

## 5. Cleaning Up
- Delete `design/wireframes.md` before next run.
