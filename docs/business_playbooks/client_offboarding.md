# Client Offboarding Playbook

This playbook defines the business logic and standard procedures for client offboarding.

## Objectives
- Securely archive all client data.
- Ensure no loose ends in CRM or Project Management systems.
- Provide high-quality handover documentation to the client.
- Free up resources for new clients.

## Workflow Steps
1. **Trigger**: Project completion or contract termination.
2. **CRM Update**: Mark Deal as 'Closed-Won' (or 'Closed-Lost' if applicable, currently defaults to Won for successful completion).
3. **Data Archival**: Move `.agent/companies/{client_id}` to `.agent/archives/{client_id}`.
4. **Documentation**: Generate `HANDOVER.md` including:
    - Project Summary
    - Credentials (warn about security)
    - Maintenance Guide
5. **Notification**: (Future) Email the handover package to the client.

## Tools
- `offboarding_workflow`: Orchestrates the entire process.
- `initiate_offboarding`: Individual step for CRM.
- `archive_client_data`: Individual step for data.
- `generate_handover_documentation`: Individual step for docs.
