import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export class VibecoderFileSystem {
  private projectPath: string;
  private vibecoderDir: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.vibecoderDir = join(this.projectPath, "vibecoder");
  }

  initVibecoder() {
    if (!existsSync(this.vibecoderDir)) {
      mkdirSync(this.vibecoderDir, { recursive: true });
    }

    const files = ["specs.md", "blueprint.md", "memories.md", "reference_heuristics.json"];
    for (const file of files) {
      const filePath = join(this.vibecoderDir, file);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, "", "utf-8");
      }
    }
    return `Initialized vibecoder directory at ${this.vibecoderDir}`;
  }

  loadSpecs(): string {
    const filePath = join(this.vibecoderDir, "specs.md");
    if (!existsSync(filePath)) return "";
    return readFileSync(filePath, "utf-8");
  }

  saveSpecs(content: string) {
    const filePath = join(this.vibecoderDir, "specs.md");
    writeFileSync(filePath, content, "utf-8");
  }

  loadBlueprint(): string {
    const filePath = join(this.vibecoderDir, "blueprint.md");
    if (!existsSync(filePath)) return "";
    return readFileSync(filePath, "utf-8");
  }

  saveBlueprint(content: string) {
    const filePath = join(this.vibecoderDir, "blueprint.md");
    writeFileSync(filePath, content, "utf-8");
  }

  loadMemories(): string {
    const filePath = join(this.vibecoderDir, "memories.md");
    if (!existsSync(filePath)) return "";
    return readFileSync(filePath, "utf-8");
  }

  saveMemories(content: string) {
    const filePath = join(this.vibecoderDir, "memories.md");
    writeFileSync(filePath, content, "utf-8");
  }

  loadReferenceHeuristics(): any {
    const filePath = join(this.vibecoderDir, "reference_heuristics.json");
    if (!existsSync(filePath)) return {};
    try {
        const content = readFileSync(filePath, "utf-8");
        return content ? JSON.parse(content) : {};
    } catch {
        return {};
    }
  }

  saveReferenceHeuristics(content: any) {
    const filePath = join(this.vibecoderDir, "reference_heuristics.json");
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
  }
}
