# Showcase Corp: End-to-End Application Development SOP

This SOP defines the workflow for building, deploying, and managing the 'Showcase TODO App'.

## 1. Project Initialization
- [ ] Create a `README.md` file describing the project.
- [ ] Initialize a `package.json` with basic dependencies (express, typescript).
- [ ] Create a `tsconfig.json` for TypeScript configuration.

## 2. Backend Development
- [ ] Create `src/server.ts` implementing a simple Express server.
- [ ] Add a GET `/health` endpoint that returns `{ status: "ok" }`.
- [ ] Add a GET `/api/todos` endpoint that returns a mock list of TODOs.

## 3. Frontend Development
- [ ] Create `public/index.html` with a simple UI to display TODOs.
- [ ] Create `public/app.js` to fetch TODOs from the API and render them.

## 4. Deployment Simulation
- [ ] Create a `deploy.sh` script that simulates deployment (e.g., verifies files exist and prints "Deploying to Railway...").
- [ ] Execute the `deploy.sh` script.

## 5. Monitoring Setup
- [ ] Verify the application is running by checking the `/health` endpoint (simulated check).
- [ ] Log a success metric using the Health Monitor.
