import { db } from "./db.js";

// Default embedding dimension for text-embedding-3-small
const EMBEDDING_DIM = 1536;

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      start_line INTEGER,
      end_line INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // check if vec_chunks exists
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'",
  );
  const result = stmt.get();

  if (!result) {
    db.exec(`
      CREATE VIRTUAL TABLE vec_chunks USING vec0(
        embedding float[${EMBEDDING_DIM}]
      );
    `);
  }
}
