import { ContextManager as IContextManager, ContextData, ContextSchema } from "../core/context.js";
import { MCP } from "../mcp.js";
import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export class ContextManager implements IContextManager {
    private mcp: MCP;
    private localFallbackPath: string;

    constructor(mcp: MCP) {
        this.mcp = mcp;
        const company = process.env.JULES_COMPANY;
        if (company) {
            this.localFallbackPath = join(process.cwd(), ".agent", "companies", company, "context.json");
        } else {
            this.localFallbackPath = join(process.cwd(), ".agent", "context.json");
        }
    }

    async readContext(lockId?: string): Promise<ContextData> {
        const company = process.env.JULES_COMPANY;

        // 1. Try Brain MCP
        try {
            const brainClient = this.mcp.getClient("brain");
            if (brainClient) {
                const result: any = await brainClient.callTool({
                    name: "brain_get_context",
                    arguments: { company }
                });

                if (result && result.content && result.content[0]) {
                    const json = JSON.parse(result.content[0].text);
                    const parsed = ContextSchema.safeParse(json);
                    if (parsed.success) {
                        return parsed.data;
                    }
                }
            }
        } catch (e) {
            // brain client might not be ready or call failed
            // console.warn("Failed to read context from Brain MCP, falling back to local file.");
        }

        // 2. Fallback to local file
        if (existsSync(this.localFallbackPath)) {
            try {
                const content = await readFile(this.localFallbackPath, "utf-8");
                const json = JSON.parse(content);
                const parsed = ContextSchema.safeParse(json);
                if (parsed.success) {
                    return parsed.data;
                }
            } catch (e) {
                console.error("Failed to read local fallback context:", e);
            }
        }

        // Default empty context
        return ContextSchema.parse({});
    }

    async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
        const company = process.env.JULES_COMPANY;

        // 1. Get current context
        const current = await this.readContext(lockId);

        // 2. Merge updates
        // Note: Deep merge might be better if we have nested objects, but ContextData is mostly flat arrays
        // Arrays are replaced, not merged, by spread operator.
        // If we want to append to arrays, the caller should handle it or we implement specific logic.
        // Assuming replace semantics for updateContext as per typical partial updates.

        const merged = { ...current, ...updates, last_updated: new Date().toISOString() };

        // Validate
        const parsed = ContextSchema.safeParse(merged);
        if (!parsed.success) {
             throw new Error(`Invalid context update: ${parsed.error.message}`);
        }
        const newContext = parsed.data;

        // 3. Try Brain MCP
        let storedInBrain = false;
        try {
            const brainClient = this.mcp.getClient("brain");
            if (brainClient) {
                await brainClient.callTool({
                    name: "brain_store_context",
                    arguments: {
                        context: JSON.stringify(newContext),
                        company
                    }
                });
                storedInBrain = true;
            }
        } catch (e) {
            console.warn("Failed to store context to Brain MCP, writing to local fallback.", e);
        }

        // 4. Always write to local fallback as cache/backup? Or only if Brain failed?
        // Prompt says: "Keep local file as a fallback/cache."
        // If it's a cache, we should write it always so readContext fallback works.
        try {
            await mkdir(dirname(this.localFallbackPath), { recursive: true });
            await writeFile(this.localFallbackPath, JSON.stringify(newContext, null, 2), "utf-8");
        } catch (localErr) {
             console.error("Failed to write local fallback context:", localErr);
             if (!storedInBrain) {
                 throw new Error("Failed to update context (Brain and local fallback failed).");
             }
        }

        return newContext;
    }

    async clearContext(lockId?: string): Promise<void> {
        // Create a fresh default context
        const empty = ContextSchema.parse({});
        // Use updateContext so it handles both Brain and local file
        // However, updateContext merges with existing. We want to REPLACE.
        // So we need to ensure updateContext overwrites everything.
        // Since we pass all fields of 'empty', it should overwrite.
        await this.updateContext(empty, lockId);
    }
}
