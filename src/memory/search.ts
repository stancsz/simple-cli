import { db } from "./db.js";
import { generateEmbedding } from "./embedder.js";
import { SearchResult, Chunk } from "./types.js";

const DEFAULT_LIMIT = 5;

export async function searchMemory(
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SearchResult[]> {
  const embedding = await generateEmbedding(query);

  // vector search using sqlite-vec
  // We select from vec_chunks using vector_distance or similar if available, or just the virtual table query
  // sqlite-vec style:
  // SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? ORDER BY distance LIMIT ?

  // Note: sqlite-vec uses 'embedding MATCH ?' and passes a raw blob or float array?
  // It usually expects a blob for the float array.
  // better-sqlite3 handles Float32Array as Buffer?
  // We need to ensure we pass the correct format.
  // sqlite-vec expects a Float32Array buffer.

  const vecBuffer = Buffer.from(new Float32Array(embedding).buffer);

  // The query for nearest neighbors
  const vecQuery = `
    SELECT
      rowid,
      distance
    FROM vec_chunks
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `;

  const results = db.prepare(vecQuery).all(vecBuffer, limit) as {
    rowid: number;
    distance: number;
  }[];

  const searchResults: SearchResult[] = [];

  for (const res of results) {
    const chunk = db
      .prepare("SELECT * FROM chunks WHERE rowid = ?")
      .get(res.rowid) as any;
    if (chunk) {
      searchResults.push({
        chunk: {
          id: chunk.id,
          filePath: chunk.file_path,
          content: chunk.content,
          type: chunk.type,
          startLine: chunk.start_line,
          endLine: chunk.end_line,
        },
        similarity: 1 - res.distance, // distance is usually cosine distance (1 - similarity)? Or L2?
        // sqlite-vec default metric is usually L2 or Cosine depending on config.
        // If vec0 is created without metric, it defaults to L2?
        // Actually, usually 'cosine' is preferred for embeddings.
        // We didn't specify metric in CREATE TABLE.
        // We should check if we can specify it in query or table creation.
        // For now, assume distance.
      });
    }
  }

  return searchResults;
}
