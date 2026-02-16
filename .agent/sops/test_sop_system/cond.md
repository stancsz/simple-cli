---
name: Conditional SOP
steps:
  - name: Step 1
    tool: tool1
    args: {}

  - name: Step 2
    condition: "{{ steps.Step 1.value }} == 'yes'"
    tool: tool2
    args: {}
---
