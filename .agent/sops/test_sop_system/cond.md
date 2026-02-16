# Conditional SOP
- [ ] Step 1
  Tool: tool1
  Args: {}

- [ ] Step 2
  Condition: {{ steps.Step 1.value }} == "yes"
  Tool: tool2
  Args: {}
