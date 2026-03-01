# Backup Architecture & Configuration

This directory contains the configurations and scripts pertinent to the Disaster Recovery system's backup mechanisms. The system relies heavily on the core `backup_manager.ts` inside the `disaster_recovery` MCP.

## Configuration Parameters

The backup configuration relies on the environment to run successfully:

- `BACKUP_ENCRYPTION_KEY`: A highly-sensitive key string used to encrypt/decrypt backups. It must be provided via the environment or `.env.agent`.
- `JULES_AGENT_DIR`: The root of the active agent state (defaults to `process.cwd() + '/.agent'`).
- `S3_BACKUP_BUCKET`: An optional bucket name. If configured, `.enc` files are automatically streamed to AWS S3.

## Backup Scope & Targets

The backup manager targets several high-value state directories natively, maintaining absolute internal boundaries to ensure multi-tenant isolation during restoration:

1. **The Brain (`.agent/brain/`)**:
   - Stores the persistent Vector Database (LanceDB).
   - Stores the Semantic Graph (`semantic.json`).
2. **Company Contexts (`.agent/companies/`)**:
   - Isolates tenant RAG storage in individual directories. The `tar` utility preserves these paths, guaranteeing that Tenant A's documents will never bleed into Tenant B's boundary upon restoration.
3. **Financial Data Integration**:
   - The backup process temporarily connects to the `Xero` APIs to retrieve up-to-date invoices, contacts, and payment JSONs. These are staged and injected into the final encrypted `tar`.

## Encryption Specifications

All `.enc` backups are secured using **AES-256-GCM**, the standard requirement for Phase 27 validation.
The system pipelines a `createCipheriv('aes-256-gcm')` stream against a compressed `.tar.gz` stream. To ensure integrity checks cannot be tampered with, the cipher's 16-byte *Auth Tag* is physically appended to the final archive bytes, while the IV is prepended.

## Automated Schedulers

Refer to `src/mcp_servers/disaster_recovery/backup_scheduler.ts` for Cron-triggered intervals, typically executing at midnight UTC.

## Disaster Recovery Procedure

For step-by-step restoration, refer to the [Disaster Recovery Procedure Guide](../../docs/disaster_recovery_procedure.md).
