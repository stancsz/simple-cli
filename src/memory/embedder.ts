const fetch = globalThis.fetch;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const EMBEDDING_MODEL_OPENAI = "text-embedding-3-small";
const EMBEDDING_MODEL_OLLAMA =
  process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";

export async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.MOCK_EMBEDDINGS === "true") {
    return generateMockEmbedding(text);
  }

  if (OPENAI_API_KEY) {
    return generateOpenAIEmbedding(text);
  } else if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA) {
    return generateOllamaEmbedding(text);
  }

  throw new Error(
    "No embedding provider configured. Set OPENAI_API_KEY or OLLAMA_HOST.",
  );
}

function generateMockEmbedding(text: string): number[] {
  // Generate a deterministic mock embedding based on text hash
  // Length 1536 to match OpenAI default
  const hash = text
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const embedding = new Array(1536).fill(0).map((_, i) => Math.sin(hash + i));
  // Normalize
  const norm = Math.sqrt(embedding.reduce((acc, v) => acc + v * v, 0));
  return embedding.map((v) => v / norm);
}

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL_OPENAI,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Embedding Error: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  return data.data[0].embedding;
}

async function generateOllamaEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL_OLLAMA,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama Embedding Error: ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  return data.embedding;
}
