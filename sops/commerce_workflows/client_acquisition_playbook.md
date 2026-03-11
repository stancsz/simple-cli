# Client Acquisition Playbook

## Purpose
This SOP details the process for the autonomous agent to acquire new clients by predicting revenue, analyzing historical data, and determining which tiered service packages to pitch.

## Pre-requisites
- Access to Xero (for historical revenue data)
- Access to HubSpot (or mocked equivalent, for active pipeline value)
- `revenue_forecasting` tool available
- `service_packager` tool available

## Steps

1. **Assess Financial Needs**
   - Run the `revenue_forecasting` tool with a forecast period of 30, 60, or 90 days.
   - Analyze the `predicted_revenue` against the agency's quarterly goals.
   - Identify gaps that require new client acquisition.

2. **Package Capabilities**
   - Execute the `service_packager` tool specifying the `target_industry` (e.g., Tech, Healthcare) based on current strategic goals.
   - Review the generated tiered service packages (Basic, Pro, Enterprise).
   - Confirm that the `estimated_delivery_time` for each package aligns with current swarm capacity.

3. **Identify Targets**
   - Use Lead Generation tools (from `business_ops`) to find prospects that fit the `target_industry`.
   - Filter out prospects with an estimated budget lower than the 'Basic' tier of the packaged services.

4. **Initiate Outreach**
   - Draft personalized proposals incorporating the output from `service_packager`.
   - Send proposals via email or CRM integration.
   - Update CRM deal stage to 'Proposal Sent'.

## Success Criteria
- Revenue gap identified and target set.
- Relevant service packages are generated and matched to prospect profiles.
- Minimum of X targeted proposals sent out autonomously per week based on capacity.
