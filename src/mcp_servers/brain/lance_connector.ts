import * as lancedb from "@lancedb/lancedb";
import { Mutex } from "async-mutex";
import { join, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { lock } from "proper-lockfile";

export class LanceConnector {
  private connection: lancedb.Connection | null = null;
  private dbPath: string;
  private companyMutexes: Map<string, Mutex> = new Map();

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<lancedb.Connection> {
    if (this.connection) return this.connection;

    if (!existsSync(this.dbPath)) {
      await mkdir(this.dbPath, { recursive: true });
    }

    this.connection = await lancedb.connect(this.dbPath);
    return this.connection;
  }

  private getMutex(company: string): Mutex {
    if (!this.companyMutexes.has(company)) {
      this.companyMutexes.set(company, new Mutex());
    }
    return this.companyMutexes.get(company)!;
  }

  async withLock<T>(company: string | undefined, action: () => Promise<T>): Promise<T> {
    const targetCompany = company || "default";
    // Sanitize company name for file path safety
    const safeCompany = targetCompany.replace(/[^a-zA-Z0-9_-]/g, "_");

    const mutex = this.getMutex(safeCompany);

    return mutex.runExclusive(async () => {
      // Inter-process locking using file system
      const lockDir = join(this.dbPath, "locks");
      if (!existsSync(lockDir)) {
        await mkdir(lockDir, { recursive: true });
      }

      const lockFile = join(lockDir, `${safeCompany}.lock`);
      if (!existsSync(lockFile)) {
        await writeFile(lockFile, "");
      }

      let release: () => Promise<void>;
      try {
        release = await lock(lockFile, {
          retries: {
            retries: 20,
            factor: 2,
            minTimeout: 100,
            maxTimeout: 2000,
            randomize: true
          },
          stale: 30000, // 30 seconds lock expiration
        });
      } catch (e: any) {
         throw new Error(`Failed to acquire lock for company ${safeCompany}: ${e.message}`);
      }

      try {
        return await action();
      } finally {
        await release();
      }
    });
  }

  async getTable(tableName: string): Promise<lancedb.Table | null> {
      const db = await this.connect();
      try {
          const tableNames = await db.tableNames();
          if (tableNames.includes(tableName)) {
              return await db.openTable(tableName);
          }
      } catch (e) {
          console.warn(`Failed to open table ${tableName}:`, e);
      }
      return null;
  }

  async createTable(tableName: string, data: any[]): Promise<lancedb.Table> {
      const db = await this.connect();
      return await db.createTable(tableName, data);
  }
}
