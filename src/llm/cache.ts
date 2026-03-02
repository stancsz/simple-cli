import { createHash } from "crypto";
import { promises as fs, existsSync } from "fs";
import { join } from "path";
import { createClient } from "redis";
import type { LLMResponse } from "../llm.js";

export interface LLMCache {
  get(prompt: string, model: string): Promise<LLMResponse | null>;
  set(prompt: string, model: string, response: LLMResponse): Promise<void>;
}

export class FileCache implements LLMCache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(ttlSeconds: number = 86400) {
    this.cacheDir = join(process.cwd(), ".agent", "cache", "llm");
    this.ttlMs = ttlSeconds * 1000;
  }

  private async ensureDir() {
    if (!existsSync(this.cacheDir)) {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  private getHash(prompt: string, model: string): string {
    return createHash("sha256").update(`${model}:${prompt}`).digest("hex");
  }

  private getFilePath(hash: string): string {
    return join(this.cacheDir, `${hash}.json`);
  }

  async get(prompt: string, model: string): Promise<LLMResponse | null> {
    const hash = this.getHash(prompt, model);
    const filePath = this.getFilePath(hash);

    try {
      const stats = await fs.stat(filePath);
      if (Date.now() - stats.mtimeMs > this.ttlMs) {
        // Cache expired
        await fs.unlink(filePath).catch(() => {});
        return null;
      }
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as LLMResponse;
    } catch {
      return null;
    }
  }

  async set(prompt: string, model: string, response: LLMResponse): Promise<void> {
    await this.ensureDir();
    const hash = this.getHash(prompt, model);
    const filePath = this.getFilePath(hash);

    try {
      await fs.writeFile(filePath, JSON.stringify(response, null, 2));
    } catch (e) {
      console.warn(`[LLMCache] Failed to write cache file: ${e}`);
    }
  }
}

export class RedisCache implements LLMCache {
  private client: any;
  private ttlSeconds: number;

  constructor(ttlSeconds: number = 86400, url?: string) {
    this.ttlSeconds = ttlSeconds;
    this.client = createClient({ url: url || process.env.REDIS_URL });
    this.client.on("error", (err: any) => console.warn(`[LLMCache] Redis Error: ${err}`));
  }

  private async ensureConnected() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  private getHash(prompt: string, model: string): string {
    return createHash("sha256").update(`${model}:${prompt}`).digest("hex");
  }

  async get(prompt: string, model: string): Promise<LLMResponse | null> {
    try {
      await this.ensureConnected();
      const hash = this.getHash(prompt, model);
      const data = await this.client.get(`llm:cache:${hash}`);
      if (!data) return null;
      return JSON.parse(data) as LLMResponse;
    } catch (e) {
      console.warn(`[LLMCache] Redis get failed: ${e}`);
      return null;
    }
  }

  async set(prompt: string, model: string, response: LLMResponse): Promise<void> {
    try {
      await this.ensureConnected();
      const hash = this.getHash(prompt, model);
      await this.client.setEx(`llm:cache:${hash}`, this.ttlSeconds, JSON.stringify(response));
    } catch (e) {
      console.warn(`[LLMCache] Redis set failed: ${e}`);
    }
  }

  async disconnect() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

export function createLLMCache(config?: {
  enabled: boolean;
  ttl?: number;
  backend?: "file" | "redis";
}): LLMCache | null {
  if (!config?.enabled) return null;
  const ttl = config.ttl || 86400; // 24 hours default

  if (config.backend === "redis" || (process.env.REDIS_URL && !config.backend)) {
    return new RedisCache(ttl, process.env.REDIS_URL);
  }
  return new FileCache(ttl);
}