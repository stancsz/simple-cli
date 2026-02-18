# Title: Deployment SOP
# Description: A standard deployment procedure.
# Author: Test User

1. Check repository status
   - Use 'ls' or 'git status' to ensure clean working directory.
   - Verify branch is main.

2. Update version file
   - Update 'version.txt' with the new version number.
   - Use 'write_file'.

3. Create commit
   - Stage changes.
   - Commit with message "Bump version".
   - Use 'git_commit'.
