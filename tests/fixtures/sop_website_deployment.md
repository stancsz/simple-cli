# Website Deployment SOP

## Purpose
Deploy a simple website for the client.

## Steps

1. Create the homepage
   - Description: Create a simple index.html file with a welcome message.
   - Tool: write_file
   - Arguments: {"filepath": "index.html", "content": "<html><body><h1>Welcome to Acme Corp</h1></body></html>"}

2. Verify the file
   - Description: List the files to ensure index.html was created.
   - Tool: ls
   - Arguments: {"path": "."}
