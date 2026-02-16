import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  init(): Promise<void>;
}

export class OpenAIEmbedder implements Embedder {
  private model: any;

  constructor() {
    // Only verify API key if we actually try to use it
  }

  async init(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    const openai = createOpenAI({ apiKey });
    this.model = openai.embedding("text-embedding-3-small");
  }

  async embed(text: string): Promise<number[]> {
    if (!this.model) await this.init();
    const { embedding } = await embed({
      model: this.model,
      value: text,
    });
    return embedding;
  }
}

export class LocalEmbedder implements Embedder {
  private pipeline: any;
  private modelName: string;

  constructor(modelName: string = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }

  async init(): Promise<void> {
    try {
      // Dynamic import to avoid crash if not installed
      const { pipeline } = await import("@xenova/transformers");
      // Create pipeline
      this.pipeline = await pipeline("feature-extraction", this.modelName);
    } catch (e) {
      console.error("Failed to load local embedder (@xenova/transformers):", e);
      throw e;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) await this.init();
    const result = await this.pipeline(text, { pooling: "mean", normalize: true });
    // Convert tensor to array
    return Array.from(result.data);
  }
}

let cachedEmbedder: Embedder | null = null;

export async function getEmbedder(): Promise<Embedder> {
  if (cachedEmbedder) return cachedEmbedder;

  // Try local first as per requirements
  try {
    const local = new LocalEmbedder();
    await local.init();
    console.log("Using Local Embedder (@xenova/transformers)");
    cachedEmbedder = local;
    return local;
  } catch (e) {
    console.warn("Local embedder failed to initialize, falling back to OpenAI.", e);
  }

  // Fallback to OpenAI
  try {
    const openai = new OpenAIEmbedder();
    await openai.init();
    console.log("Using OpenAI Embedder");
    cachedEmbedder = openai;
    return openai;
  } catch (e) {
    console.error("OpenAI Embedder failed.", e);
    throw new Error("No available embedder. Please set OPENAI_API_KEY or install @xenova/transformers.");
  }
}
