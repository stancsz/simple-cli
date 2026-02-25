# Project Management Automation Playbook

## Overview
This playbook defines the automated process for creating and managing Linear projects based on HubSpot deals. This integration ensures that every closed deal in HubSpot automatically triggers the creation of a corresponding project in Linear, complete with initial milestones and tasks.

## Goals
- **Eliminate Manual Setup**: Automatically create projects and tasks.
- **Ensure Consistency**: Standardize project structure and milestones.
- **Traceability**: Link Linear projects back to HubSpot deals and Xero invoices.

## Workflow

### 1. Trigger: Deal Creation/Update
The process is triggered when a Deal is created or updated in HubSpot (e.g., via `client_onboarding_workflow`).

### 2. Synchronization Logic (`sync_deal_to_linear`)
The `sync_deal_to_linear` tool orchestrates the setup:
1.  **Check for Existing Project**: Queries Linear for a project with a matching name or `[Deal: ID]` tag.
2.  **Create Project**: If not found, creates a new project in the default Team (configured via `LINEAR_TEAM_ID`).
    -   **Name**: `Client Project: {Client Name}`
    -   **Description**: Includes Deal ID, Amount, and Stage.
3.  **Create Milestones**: Automatically creates initial issues for standard phases:
    -   Discovery Phase
    -   Sprint 1
    -   Sprint 2
    -   Review & Handover

### 3. Integration Points
-   **HubSpot**: Source of truth for Deal data.
-   **Linear**: Destination for project management.
-   **Xero**: Linked via Client/Contact sync.

## Configuration
-   `LINEAR_API_KEY`: Required for API access.
-   `LINEAR_TEAM_ID`: Default team for new projects.

## Validation
This workflow is validated by `tests/integration/agency_workflow_validation.test.ts`, which simulates the full lifecycle from Client Onboarding to Project Setup.
