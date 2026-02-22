# Onboarding New Company

This SOP automates the setup of a new company environment, activating all 6 Pillars of the simple-cli framework.

1. **Initialize Company Context**: Use the `init_company` tool to create the directory structure and initial configuration for the new company. Use the input provided as the company name.
2. **Initialize Brain**: Use `brain_store` to log a "Company Created" event with the current timestamp and company name. This ensures the episodic memory is active.
3. **Create Sample SOP**: Use `sop_create` to create a simple SOP named "hello_world" with the content "# Hello World\n1. **Say Hello**: Log 'Hello World' to the console.".
4. **Schedule Job Delegator**: Use `scheduler_add_task` to schedule the "Job Delegator" (id: job-delegator) to run every hour (`0 * * * *`). Trigger: cron. Prompt: "Check for pending tasks and delegate them.".
5. **Schedule Reviewer**: Use `scheduler_add_task` to schedule the "Reviewer" (id: reviewer) to run every hour at minute 30 (`30 * * * *`). Trigger: cron. Prompt: "Review recent code changes.".
6. **Schedule HR Review**: Use `scheduler_add_task` to schedule the "Daily HR Review" (id: hr-review) to run daily at 3 AM (`0 3 * * *`). Trigger: cron. Prompt: "Run the Daily HR Review using the 'analyze_logs' tool.".
7. **Validate Onboarding**: Use `validate_onboarding` with the company name to verify that all pillars (Context, Brain, SOPs, Ghost Mode, HR, Health) are correctly set up and save a report.
