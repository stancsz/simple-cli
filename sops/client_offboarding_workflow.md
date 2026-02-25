# Client Offboarding Workflow

This SOP outlines the automated process for offboarding a client.

1. **Initiate Offboarding**: Call `initiate_offboarding` with the `client_id` to update the CRM status to 'Closed-Won' and log the start of the process.
2. **Archive Data**: Call `archive_client_data` to securely move all client files and context to the archive storage.
3. **Generate Handover**: Call `generate_handover_documentation` to create a comprehensive handover package based on the archived context.
4. **Finalize**: The `offboarding_workflow` tool orchestrates these steps automatically.
