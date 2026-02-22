# Company Management

The Simple CLI provides a robust system for managing multiple company contexts (tenants). Each company has its own isolated Brain (LanceDB), SOPs, and configuration.

## CLI Commands

### 1. Initialize a Company
Create a new company context with default onboarding templates.

```bash
simple init-company <name>
```

This will:
- Create directory structure in `.agent/companies/<name>/`.
- Initialize LanceDB.
- Copy default SOPs and Brain configuration from `templates/company_onboarding/`.
- Update `.agent/config.json` and set it as the active company.

### 2. List Companies
View all active and archived companies.

```bash
simple company list
```

### 3. Switch Context
Switch the active company context. This setting persists across CLI sessions.

```bash
simple company switch <name>
```

### 4. Archive Company
Move a company to the archive. Archived companies are no longer active and their data is moved to `.agent/archive/companies/`.

```bash
simple company archive <name>
```

### 5. Check Status
Check which company is currently active.

```bash
simple company status
```

## MCP Tools

The **Company Context MCP Server** exposes these management capabilities to agents:

- `list_companies`: Returns a JSON list of active and archived companies.
- `get_active_company`: Returns the name of the currently active company.
- `archive_company`: Archives a specified company.

## Directory Structure

```
.agent/
  config.json          # Global config (active_company, companies list)
  companies/
    <name>/
      brain/           # LanceDB vector store
      config/          # Company-specific config
      sops/            # Standard Operating Procedures
      docs/            # RAG documents
  archive/
    companies/
      <name>/          # Archived company data
```
