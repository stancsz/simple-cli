# Agency Orchestrator

The `agency_orchestrator` MCP server is a foundational component of Phase 33. It enables the root Simple-CLI agency to coordinate multiple specialized child agencies for complex, multi-agency projects.

## Overview

The orchestrator operates as a top-level project manager, taking high-level project specifications and delegating them down to specialized agencies using the **Agency Spawning Protocol**. It also manages dependencies between tasks to ensure proper execution order and tracks overall project health.

## Key Features

1. **Project Breakdown**: Accepts a JSON payload defining tasks, dependencies, and required capabilities.
2. **Agency Assignment & Spawning**: Can bind existing child agencies to tasks or dynamically spawn new ones with specific contexts and constraints.
3. **Dependency Resolution**: Understands the graph of tasks. Tasks blocked by unresolved dependencies are tracked, and dependencies can be resolved.
4. **Holistic Monitoring**: Aggregates the status of all assigned agencies into a unified progress report.

## Tools

*   `create_multi_agency_project(project_spec: string) -> project_id`: Parses a project specification defining tasks and dependencies, storing it in the Brain.
*   `assign_agency_to_task(project_id: string, task_id: string, agency_config: AgencyConfig) -> assignment_id`: Assigns an existing child agency to a task, or spawns a new one if no `agency_id` is provided.
*   `monitor_project_status(project_id: string) -> ProjectStatus`: Aggregates task statuses and computes overall progress and current blockers.
*   `resolve_inter_agency_dependency(project_id: string, dependency: Dependency) -> void`: Marks a dependency as resolved, unblocking downstream tasks.

## Example Workflow

1. Create the project:
   ```json
   {
       "name": "E-commerce App",
       "tasks": [
           { "task_id": "frontend_dev", "description": "Build UI" },
           { "task_id": "backend_api", "description": "Build API" }
       ]
   }
   ```
2. Call `create_multi_agency_project` with the JSON above.
3. Call `assign_agency_to_task` to spawn a frontend agency for `frontend_dev`.
4. Monitor the status using `monitor_project_status`.
