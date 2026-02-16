---
name: Market Research
steps:
  - name: Research
    tool: llm
    args:
      prompt: "I need to research the latest trends in AI agents for 2024. Please list 3 key search queries I should use."
    description: "Identify search queries using LLM."
  - name: Write Report
    tool: write_file
    args:
      path: "market_research_report.md"
      content: "Report on AI Agents 2024:\n\n{{ steps.Research }}"
    description: "Write the research findings to a local file."
---

# Market Research SOP
This SOP demonstrates a simple research workflow. It simulates research by asking an LLM for search queries and then saves the output to a file using the filesystem tool.
