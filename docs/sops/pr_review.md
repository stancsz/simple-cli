# PR Review

This SOP outlines the steps to review a Pull Request.

1. **Checkout Branch**
   Switch to the branch associated with the PR to be reviewed.
   Use `git` tools to checkout.

2. **Analyze Changes**
   List the files changed in the PR.
   Read the changes (diffs) to understand what was modified.

3. **Run Tests**
   Run the project's test suite to ensure no regressions were introduced.
   Note any failures.

4. **Review Code Quality**
   Check the code for style, readability, and best practices.
   Look for potential bugs or security issues.
   Use an LLM or static analysis tools if available.

5. **Submit Review**
   Summarize your findings.
   If there are issues, list them clearly.
   If the PR is good, approve it.
   (Note: In this automated context, generate a review report file `pr_review_report.md`).
