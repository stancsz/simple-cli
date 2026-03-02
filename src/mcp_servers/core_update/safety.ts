import { createLLM } from "../../llm/index.js";
import { supervisorPrompt } from "./prompts.js";
import { join, isAbsolute, relative } from "path";

// Interface for User Approval to allow mocking
export interface UserApproval {
  prompt(message: string, timeout: number): Promise<boolean>;
}

export class DefaultUserApproval implements UserApproval {
  async prompt(message: string, timeout: number): Promise<boolean> {
    console.error(`\n[Core Update Safety] ${message}`);
    console.error(`[Core Update Safety] Waiting for approval (timeout: ${timeout}ms)...`);

    // In a real interactive CLI, we would use prompts here.
    // However, since this runs as an MCP server (potentially non-interactive),
    // we default to assuming REJECTION if no explicit approval signal is received.
    // This ensures safety: silence is not consent.

    return new Promise((resolve) => {
        setTimeout(() => {
            console.error("[Core Update Safety] Timeout reached. Auto-rejecting update.");
            resolve(false);
        }, timeout);
    });
  }
}

export class SafetyProtocol {
  private llm: ReturnType<typeof createLLM>;
  private userApproval: UserApproval;

  constructor(userApproval?: UserApproval) {
    this.llm = createLLM("openai:gpt-4o"); // Use a strong model for supervision
    this.userApproval = userApproval || new DefaultUserApproval();
  }

  public async verify(filePath: string, diff: string, summary: string, yoloMode: boolean = false, timeout: number = 30000): Promise<void> {
    // 1. Path Validation
    this.validatePath(filePath);

    // 2. Supervisor Verification
    console.error(`[Core Update Safety] Supervisor reviewing change to ${filePath}...`);
    const prompt = supervisorPrompt(filePath, diff, summary);
    const response = await this.llm.generate(prompt, []);

    let decision: any;
    try {
        const rawMsg = response.message || response.raw;
        const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            decision = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("Invalid JSON response from Supervisor");
        }
    } catch (e: any) {
        throw new Error(`Supervisor failed to produce a valid decision: ${e.message}`);
    }

    if (!decision.approved) {
        throw new Error(`Supervisor REJECTED the update: ${decision.reason} (Risk: ${decision.risk_level})`);
    }

    console.error(`[Core Update Safety] Supervisor APPROVED: ${decision.reason}`);

    // 3. Human Approval
    if (!yoloMode) {
        const approved = await this.userApproval.prompt(
            `Approve core update to ${filePath}?\nSummary: ${summary}\nRisk: ${decision.risk_level}`,
            timeout
        );
        if (!approved) {
            throw new Error("User rejected the update.");
        }
    }
  }

  private validatePath(filePath: string) {
    const cwd = process.cwd();
    const absolutePath = isAbsolute(filePath) ? filePath : join(cwd, filePath);
    const relativePath = relative(cwd, absolutePath);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new Error(`Access denied: File ${filePath} is outside the project root.`);
    }

    const allowedExtensions = ['.ts', '.js', '.json', '.md'];
    const hasAllowedExt = allowedExtensions.some(ext => filePath.endsWith(ext));
    if (!hasAllowedExt) {
        throw new Error(`Access denied: File type not allowed for core updates.`);
    }
  }
}
