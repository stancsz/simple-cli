import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export const PersonaConfigSchema = z.object({
  name: z.string(),
  role: z.string(),
  voice: z.object({
    tone: z.string(),
  }),
  emoji_usage: z.boolean(),
  catchphrases: z.object({
    greeting: z.array(z.string()),
    signoff: z.array(z.string()),
    filler: z.array(z.string()).optional(),
  }),
  working_hours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/, "Invalid working hours format (HH:mm-HH:mm)"),
  response_latency: z.object({
    min: z.number(),
    max: z.number(),
  }),
  enabled: z.boolean().optional().default(true),
});

export type PersonaConfig = z.infer<typeof PersonaConfigSchema>;

export async function loadPersonaConfig(path: string): Promise<PersonaConfig | null> {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    return PersonaConfigSchema.parse(parsed);
  } catch (e) {
    console.error(`Failed to load persona config from ${path}:`, e);
    return null;
  }
}
