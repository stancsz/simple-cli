# Client Onboarding SOP

**Objective:** Standardize the onboarding process for new agency clients, ensuring all systems (CRM, Finance, Project Management, and Company Context) are synchronized and ready for service delivery.

**Scope:** Applies to all new client intake, regardless of service type (Web Dev, Consulting, Marketing).

**Trigger:** New signed contract or lead conversion.

## Workflow Overview

This process is automated via the `client_onboarding_workflow` tool in the `business_ops` MCP server.

1.  **Intake & Context Creation**
    -   Create a unique Company Context (isolated filesystem, brain).
    -   Command: `npx tsx src/cli.ts onboard-company <client-name>`
    -   Outcome: Directory structure created in `.agent/companies/<client-name>/`.

2.  **CRM Setup (HubSpot)**
    -   Create Company record.
    -   Create Contact record associated with the Company.
    -   Log the `companyId` and `contactId`.

3.  **Project Management (Linear)**
    -   Determine the `Team` (via `LINEAR_TEAM_ID` env var).
    -   Create a new **Project** or **Parent Issue** titled "Onboard Client: <ClientName>".
    -   Apply the relevant template tasks based on `serviceType`.

4.  **Financial Setup (Xero)**
    -   Create Contact in Xero.
    -   Generate a **Draft Invoice** for the initial deposit (e.g., 50% or retainer).

5.  **Documentation**
    -   Generate a `welcome.md` file in the client's context folder.
    -   Populate with onboarding checklist and contact details.

## Manual Steps (If Automation Fails)

If the `client_onboarding_workflow` fails, the error log will indicate which step failed.

-   **Context Failure:** Run `simple onboard-company <name>` manually.
-   **CRM Failure:** Log in to HubSpot and create the company manually.
-   **Linear Failure:** Create the project in Linear and link it in the welcome doc.
-   **Xero Failure:** Create the contact and invoice in Xero manually.

## Configuration

Templates for different service types are located in `docs/business_playbooks/client_onboarding_templates/`.
-   `web_dev.json`
-   `consulting.json`
-   `marketing.json`

Modify these JSON files to update the default task lists and billing rules.
