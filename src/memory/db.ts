import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import fs from "fs";

const MEMORY_DB_PATH = path.join(process.cwd(), ".agent", "memory.sqlite");

// Ensure .agent directory exists
const agentDir = path.join(process.cwd(), ".agent");
if (!fs.existsSync(agentDir)) {
  fs.mkdirSync(agentDir, { recursive: true });
}

export const db: Database.Database = new Database(MEMORY_DB_PATH);

// Load sqlite-vec extension
sqliteVec.load(db);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");
