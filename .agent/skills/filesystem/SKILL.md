
---
name: filesystem
description: Tools for advanced file system operations.
---
# Filesystem Skill

This skill provides functionality for:
- Reading files (`read_file`)
- Writing files (`write_file`)
- Listing directories (`list_dir`)

It mirrors standard fs modules but exposes them as agent tools to perform file-level operations explicitly.

### Tools
- **read_file**: Read text content from any file path.
- **write_file**: Overwrite/Create a file with content.
- **list_dir**: List files/folders in a path.
