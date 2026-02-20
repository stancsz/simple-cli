export interface VectorDoc {
  id: string;
  text: string;
  metadata?: any;
  score?: number;
}

export interface VectorStore {
  add(doc: VectorDoc): Promise<void>;
  search(query: string, limit?: number): Promise<VectorDoc[]>;
}

export class JsonVectorStore implements VectorStore {
  private docs: VectorDoc[] = [];

  async add(doc: VectorDoc): Promise<void> {
    this.docs.push(doc);
  }

  async search(query: string, limit: number = 5): Promise<VectorDoc[]> {
    const q = query.toLowerCase();
    const queryWords = q.split(/\s+/);
    const queryWordsCount = queryWords.length;

    // Simple keyword matching for now
    const results = this.docs
      .map((doc) => {
        const text = doc.text.toLowerCase();
        let score = 0;
        if (text.includes(q)) score += 0.5;
        // Basic word overlap
        const matchCount = queryWords.filter((w) => text.includes(w)).length;
        score += (matchCount / queryWordsCount) * 0.5;

        return { ...doc, score };
      })
      .filter((doc) => doc.score! > 0)
      .sort((a, b) => b.score! - a.score!)
      .slice(0, limit);

    return results;
  }
}
