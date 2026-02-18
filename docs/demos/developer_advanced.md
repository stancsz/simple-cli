---
layout: page
title: Advanced Developer Demo
---

# Advanced Developer Demo: Full-Stack Rate Limiting

## Overview
This demo showcases the **Complex Engineering** capabilities of the Developer agent. The user will ask the agent to implement **API Rate Limiting** on a running FastAPI backend and update the frontend to handle potential `429 Too Many Requests` status codes.

This requires the agent to:
1.  **Modify Backend**: Add `FastAPI-Limiter` or custom middleware to `main.py`.
2.  **Modify Frontend**: Update `index.html` to show a user-friendly toast message for rate limits.
3.  **Run Tests**: Create a separate script `load_test.py` to simulate traffic and verify the fix.

## Setup Instructions

### 1. Prerequisites
Ensure you have the required Python packages:
```bash
pip install fastapi uvicorn requests slowapi
```

### 2. Run the Simulation (CLI)
Navigate to the `demos/developer_advanced` directory.

```powershell
$env:SIMPLE_CLI_SKILL="code"
cd demos/developer_advanced

# Start the server (optional, or simulate it)
# python backend/main.py &

# Run the agent
../../bin/simple "Add rate limiting to the API in 'backend/main.py' (max 5 requests per minute per IP). Update 'frontend/index.html' to display 'Rate limit exceeded, please wait.' when getting a 429. Write a 'load_test.py' to verify the limit triggers."
```

### 3. Expected Outcome
The agent will:
*   Install `slowapi`.
*   Edit `backend/main.py` to import and use `Limiter`.
*   Edit `frontend/index.html` logic (Javascript fetch).
*   Create and run `load_test.py` demonstrating `200 OK` for first 5 hits and `429 Too Many Requests` for the 6th.

## Why This is Impressive
*   **Multi-File Edit**: The agent coordinates changes across Python (Backend) and HTML/JS (Frontend).
*   **System Design**: It understands how middleware affects API behavior.
*   **Verification**: It writes a load test to prove its work, a best practice in DevOps.

[Back to Demos](./index.md)
