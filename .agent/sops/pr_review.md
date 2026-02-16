---
name: PR Review
steps:
  - name: Analyze_Code
    tool: llm
    args:
      prompt: "Review the following code snippet for bugs:\n\nfunction calculateTotal(a, b) {\n  return a - b; // Intended to be addition\n}"
    description: "Analyze the code for potential bugs."
  - name: Draft_Comment
    tool: llm
    args:
      prompt: "Draft a polite and constructive code review comment based on this analysis: {{ steps.Analyze_Code }}"
    description: "Draft the review comment."
---

# PR Review SOP
This SOP simulates a code review process. It analyzes a code snippet (simulating reading a PR diff) and drafts a comment.
