# Client Onboarding SOP

**Objective**: Onboard a new client by setting up CRM, Xero, and Project Management.

## Triggers
- New client signed contract.
- `onboarding-workflow` triggered.

## Steps

1.  **CRM Setup (HubSpot)**
    - Use `create_company` to create the client entity.
    - Use `create_contact` to add primary contact.
    - Create a deal for "Initial Setup".

2.  **Financial Setup (Xero)**
    - Use `xero_create_contact` to add client to Xero.
    - Create an initial invoice for "Setup Fee".

3.  **Project Management (Linear)**
    - Create a new Project for the client.
    - Create issues for:
        - "Requirements Gathering"
        - "Infrastructure Setup"
        - "Kickoff Meeting"

4.  **Verification**
    - Ensure all entities are linked (store IDs in memory).
    - Send welcome email (simulated).

## Success Criteria
- Client exists in HubSpot, Xero, and Linear.
- Initial invoice sent.
