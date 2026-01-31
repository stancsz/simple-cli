---
layout: default
title: Custom Skills
nav_order: 7
---

# 🧬 Enabling Self-Evolution

Simple-CLI is one of the few agents that can **expand its own action space**.

## How to Create a Skill

### 🏷️ AI Attribution (Required)
All tools created by Simple-CLI for itself must be clearly marked to differentiate them from core system tools.
- **Scripts**: Include `# [Simple-CLI AI-Created]` as the very first line.
- **Documentation**: Include `<!-- [Simple-CLI AI-Created] -->` as the very first line of the MD file.

### Method A: Standalone Documentation (Recommended)
1. Write any script (e.g., `skills/search_web.py`).
2. Create `skills/search_web.md` with the following content:
   ```markdown
   # searchWeb
   Uses a Python scrapper to find info.
   
   ## Command
   python skills/search_web.py
   
   ## Parameters
   - query: string - The search term
   ```

### Method B: Internal Documentation
Just put the Markdown specification at the very top of your script inside comments:
```python
"""
# helloTool
A simple greeting tool.

## Parameters
- name: string
"""
import sys
# ...
```

### Method C: Working Folders
For complex tools, use a folder (e.g., `skills/my_complex_tool/`). You can store the documentation as:
-   `skills/my_complex_tool/my_complex_tool.md` (inside the folder)
-   `skills/my_complex_tool.md` (parallel to the folder)

Simple-CLI recursively scans these directories to find the most relevant "entry point" for your skill.

## The Self-Evolution Loop
You can ask the agent:
> "Write a new skill in Python that allows you to calculate financial projections using the 'numpy' library. Document it in an MD file, and then reload your tools."

**The Agent will:**
1. Generate the Python code.
2. Generate the MD specification.
3. Call the `reloadTools` tool.
4. **Result**: For the rest of the session (and future sessions), the agent is now "Expert" in financial projections.