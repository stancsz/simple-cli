# Jules Worker Agent Usage Guide

The **Jules Worker Agent** allows you to delegate coding tasks to the Google Jules API, which automatically creates Pull Requests (PRs).

## Configuration
Ensure your `JULES_API_KEY` is set in `.env` or passed via configuration.

## Basic Usage
To assign a task to Jules:
```bash
simple delegate_cli jules "Implement a new feature to parse JSON logs" --file src/utils.ts
```

## Workflow
1.  **Delegation**: Jules receives the task.
2.  **Execution (Cloud)**:
    *   Jules API creates a session and a branch in your repo.
    *   It generates code based on the prompt.
    *   It opens a **Pull Request**.
3.  **Review Loop**:
    *   **List**: `simple run_tool pr_list` to see the PR ID.
    *   **Review**: `simple run_tool pr_review --pr_number <id>` to see the diff.
    *   **Feedback**: If changes are needed, tag Jules in a comment:
        ```bash
        simple run_tool pr_comment --pr_number <id> --body "@jules please fix the indentation in util.ts and add a test case."
        ```
    *   **Ready**: Mark the Draft PR as ready for review:
        ```bash
        simple run_tool pr_ready --pr_number <id>
        ```
    *   **Merge**: If good, merge it:
        ```bash
        simple run_tool pr_merge --pr_number <id> --method squash
        ```

## Troubleshooting
- **API Key**: Ensure `JULES_API_KEY` starts with `AQ.` or similar.
- **Access**: Ensure the repository is connected to your Jules account (list sources via API manually if needed).
