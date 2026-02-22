import { join } from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";

export interface MemoryPolicy {
  access: 'read-only' | 'read-write' | 'none';
  shared: boolean;
  isolation?: 'strict' | 'shared';
}

export interface FrameworkConfig {
  name: string;
  path: string;
  memoryPolicy: MemoryPolicy;
  status: 'active' | 'inactive';
}

export class FrameworkIngestionEngine {
  private baseDir: string;
  private frameworks: Map<string, FrameworkConfig> = new Map();

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  getDefaultPolicy(): MemoryPolicy {
    return {
        access: 'read-write',
        shared: true,
        isolation: 'shared'
    };
  }

  async scanForFrameworks(): Promise<FrameworkConfig[]> {
      const mcpDir = join(this.baseDir, "src", "mcp_servers");
      if (!existsSync(mcpDir)) return [];

      const entries = await readdir(mcpDir, { withFileTypes: true });
      const discovered: FrameworkConfig[] = [];

      for (const entry of entries) {
          if (entry.isDirectory()) {
              const frameworkName = entry.name;
              // Skip core servers that are part of the platform itself to avoid circular dependency or redundancy
              // strictly speaking, but Brain is one.
              if (frameworkName === "brain" || frameworkName === "operational_persona") {
                  continue;
              }

              const config = await this.registerFramework(frameworkName);
              if (config) {
                  discovered.push(config);
              }
          }
      }
      return discovered;
  }

  async registerFramework(frameworkName: string): Promise<FrameworkConfig | null> {
    const frameworkPath = join(this.baseDir, "src", "mcp_servers", frameworkName);

    if (!existsSync(frameworkPath)) {
        console.warn(`Framework ${frameworkName} not found at ${frameworkPath}`);
        return null;
    }

    const config: FrameworkConfig = {
        name: frameworkName,
        path: frameworkPath,
        memoryPolicy: this.getDefaultPolicy(),
        status: 'active'
    };

    this.frameworks.set(frameworkName, config);
    // In a real implementation, we would inject tools here.
    // For now, we simulate the registration.

    return config;
  }

  /**
   * Retrieves the memory configuration for a specific framework.
   * This method is intended to be called by the framework wrapper or the orchestrator
   * to inject the necessary configuration into the framework's runtime environment.
   *
   * @param frameworkName The name of the framework.
   * @returns The memory policy configuration or null if not registered.
   */
  injectContext(frameworkName: string): MemoryPolicy | null {
    const config = this.frameworks.get(frameworkName);
    if (!config) {
        return null;
    }

    return config.memoryPolicy;
  }

  validateCompanyName(company: string): boolean {
      return /^[a-zA-Z0-9_-]+$/.test(company);
  }
}
