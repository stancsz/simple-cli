# Enterprise Migration: Monolith Analysis SOP

**Objective:** Analyze the legacy 'core-banking-monolith' codebase to identify bounded contexts and propose a microservices decomposition strategy.

## Phase 1: Discovery & Metrics
1. **Scan Codebase Structure**
   - Use `filesystem` tools to list the root directory and key source folders (e.g., `src/main/java`).
   - Identify the primary modules (e.g., `accounts`, `payments`, `users`).
   - *Tool:* `list_files`, `read_file` (on `pom.xml` or `build.gradle`).

2. **Analyze Dependencies**
   - specific instructions: "Check for tight coupling between modules."
   - Identify shared libraries or "god classes" that might impede separation.
   - *Tool:* `grep` or `read_file` to look for import statements.

## Phase 2: Domain Identification (DDD)
3. **Identify Bounded Contexts**
   - Based on the folder structure and package names, propose logical boundaries.
   - Example: "The `com.fintech.payments` package seems self-contained."
   - *Tool:* `brain` (store findings).

4. **Service Decomposition Proposal**
   - Propose a list of candidate microservices.
   - Define the responsibility of each service.
   - Define the database ownership for each service.
   - *Output:* Write a summary to `migration_proposal.md`.

## Phase 3: Migration Roadmap
5. **Draft Strangler Fig Plan**
   - Identify the first candidate for extraction (usually the least dependent module, e.g., `notifications` or `user-profile`).
   - Define the API contract (OpenAPI/Swagger) for the new service.
   - *Tool:* `write_file` (create `roadmap.md`).

6. **Review & Approval**
   - Ask the user (or simulate approval) to proceed with the first extraction.
