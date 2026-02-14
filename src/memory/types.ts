export interface Chunk {
  id: string;
  filePath: string;
  content: string;
  type: "class" | "interface" | "function" | "markdown" | "other";
  startLine: number;
  endLine: number;
  embedding?: number[];
}

export interface SearchResult {
  chunk: Chunk;
  similarity: number;
}
