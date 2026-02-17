import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface CompanyProfile {
  name: string;
  brandVoice?: string;
  internalDocs?: string[];
  sops?: string[];
}

export async function loadCompanyProfile(company: string): Promise<CompanyProfile | null> {
  // Sanitize company name to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(company)) {
    console.error(`Invalid company name: ${company}`);
    return null;
  }

  const filePath = join(process.cwd(), ".agent", "companies", `${company}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = await readFile(filePath, "utf-8");
    const profile = JSON.parse(content);
    return profile;
  } catch (e) {
    console.error(`Failed to load company profile for ${company}:`, e);
    return null;
  }
}

export async function saveCompanyProfile(company: string, profile: CompanyProfile): Promise<void> {
  const dirPath = join(process.cwd(), ".agent", "companies");
  const filePath = join(dirPath, `${company}.json`);

  if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
  }

  try {
      await writeFile(filePath, JSON.stringify(profile, null, 2));
  } catch (e) {
      console.error(`Failed to save company profile for ${company}:`, e);
      throw e;
  }
}
