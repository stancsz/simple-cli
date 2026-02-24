# Client Onboarding SOP

**Goal:** Systematically onboard a new client to the PixelForge Agency ecosystem.

**Prerequisites:**
-   Client Name
-   GitHub Organization Access
-   Slack Channel ID

---

## 1. Project Initialization
**Prompt:** "Initialize a new Company Context for the client."
-   Command: `simple init-company <client-slug>`
-   Action: Configure `company_context.json` with the client's Tech Stack and Brand Voice.

## 2. Infrastructure Setup
**Prompt:** "Set up the initial repository structure."
-   Tool: `filesystem`, `git`
-   Steps:
    1.  Clone the `agency-starter-kit` (if available) or create a new directory.
    2.  Initialize `git init`.
    3.  Create standard folder structure: `src/`, `docs/`, `tests/`, `.github/workflows/`.
    4.  Create a README.md with the client's name and project goals.

## 3. Communication Channels
**Prompt:** "Verify team access."
-   Tool: `browser` (via Desktop Orchestrator) or Manual Check
-   Steps:
    1.  Verify all assigned developers have access to the GitHub repo.
    2.  Post a "Hello World" message to the client's Slack channel.

## 4. First Deliverable
**Prompt:** "Generate the initial roadmap."
-   Tool: `llm`
-   Steps:
    1.  Review the client's requirements document (if provided in `docs/`).
    2.  Draft a `docs/ROADMAP.md` with Phase 1 deliverables.
    3.  Commit the roadmap to the repository.

---

**Completion Criteria:**
-   [ ] Company Context exists in `.agent/companies/`.
-   [ ] Git repo is initialized and pushed.
-   [ ] Roadmap is created.
