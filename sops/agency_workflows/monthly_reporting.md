# Monthly Reporting SOP

**Objective**: Generate and deliver monthly performance report to the client.

## Triggers
- First Monday of the month.
- `reporting-workflow` triggered.

## Steps

1.  **Data Collection**
    - Use `get_company_metrics` (Health Monitor) to get performance data.
    - Use `xero_get_invoices` to get billing status.
    - Use `linear_list_issues` to get completed tasks.

2.  **Report Generation**
    - Use `generate_client_report` (Agency Operations) to create the report content.
    - Include:
        - Tasks Completed
        - SLA Compliance
        - Next Month Plan

3.  **Delivery**
    - (Simulated) Email report to client contact.

## Success Criteria
- Report generated and delivered.
