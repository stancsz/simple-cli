import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { parse, stringify } from "yaml";
import { SOPDefinition } from "./sop_definition_schema.js";

export class SOPRegistry {
  private workflowDir: string;
  private companyWorkflowDir?: string;

  constructor() {
    this.workflowDir = join(process.cwd(), ".agent", "workflows");

    const company = process.env.JULES_COMPANY;
    if (company) {
      this.companyWorkflowDir = join(process.cwd(), ".agent", "companies", company, "workflows");
    }
  }

  private async ensureDir(dir: string) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async listSOPs(): Promise<string[]> {
    const sops = new Set<string>();

    // Scan global workflows
    if (existsSync(this.workflowDir)) {
      const files = await readdir(this.workflowDir);
      files.filter(f => f.endsWith(".sop.yaml") || f.endsWith(".sop.json")).forEach(f => {
        sops.add(f.replace(/\.sop\.(yaml|json)$/, ""));
      });
    }

    // Scan company workflows (override global if same name)
    if (this.companyWorkflowDir && existsSync(this.companyWorkflowDir)) {
      const files = await readdir(this.companyWorkflowDir);
      files.filter(f => f.endsWith(".sop.yaml") || f.endsWith(".sop.json")).forEach(f => {
        sops.add(f.replace(/\.sop\.(yaml|json)$/, ""));
      });
    }

    return Array.from(sops);
  }

  async getSOP(name: string): Promise<SOPDefinition | null> {
    const filename = `${name}.sop.yaml`; // Prefer YAML
    const jsonFilename = `${name}.sop.json`;

    let path: string | null = null;

    // Check company dir first
    if (this.companyWorkflowDir) {
      const yamlPath = join(this.companyWorkflowDir, filename);
      const jsonPath = join(this.companyWorkflowDir, jsonFilename);
      if (existsSync(yamlPath)) path = yamlPath;
      else if (existsSync(jsonPath)) path = jsonPath;
    }

    // Check global dir if not found
    if (!path) {
      const yamlPath = join(this.workflowDir, filename);
      const jsonPath = join(this.workflowDir, jsonFilename);
      if (existsSync(yamlPath)) path = yamlPath;
      else if (existsSync(jsonPath)) path = jsonPath;
    }

    if (!path) return null;

    try {
      const content = await readFile(path, "utf-8");
      if (path.endsWith(".json")) {
        return JSON.parse(content) as SOPDefinition;
      } else {
        return parse(content) as SOPDefinition;
      }
    } catch (e) {
      console.error(`Error parsing SOP ${name}:`, e);
      return null;
    }
  }

  async saveSOP(def: SOPDefinition): Promise<void> {
    const dir = this.companyWorkflowDir || this.workflowDir;
    await this.ensureDir(dir);

    const path = join(dir, `${def.name}.sop.yaml`);
    await writeFile(path, stringify(def));
  }
}
