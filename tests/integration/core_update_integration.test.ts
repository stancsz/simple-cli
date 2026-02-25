import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { writeFile, readFile, mkdir, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createPatch } from 'diff';
import { createLLM } from '../../src/llm.js';
import { analyzeCodeSmellTool, proposeCoreUpdateTool, applyCoreUpdateTool } from '../../src/mcp_servers/core_update/tools.js';
import { SafetyProtocol } from '../../src/mcp_servers/core_update/safety.js';

// Mock LLM
vi.mock('../../src/llm.js', () => ({
  createLLM: vi.fn().mockReturnValue({
    generate: vi.fn()
  })
}));

// Mock EpisodicMemory to avoid DB writes
vi.mock('../../src/brain/episodic.js', () => ({
  EpisodicMemory: class {
    init = vi.fn().mockResolvedValue(undefined);
    store = vi.fn().mockResolvedValue(undefined);
  }
}));

describe('Core Update Integration', () => {
  const testDir = join(process.cwd(), 'tests', 'temp_core_update');
  const testFile = join(testDir, 'test_component.ts');
  const relativeTestFile = 'tests/temp_core_update/test_component.ts';

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(testFile, 'export const hello = () => "world";');
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // await rm(testDir, { recursive: true, force: true });
    // Keep for debugging if needed, or clean up
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }
    // Clean up backups
    const backupsDir = join(process.cwd(), '.agent', 'backups');
    if (existsSync(backupsDir)) {
        // await rm(backupsDir, { recursive: true, force: true });
    }
  });

  it('should analyze code smell', async () => {
    const mockLLM = createLLM();
    (mockLLM.generate as any).mockResolvedValue({
      message: JSON.stringify({
        issues: [{ type: 'performance', description: 'Inefficient string concat' }],
        summary: 'Found 1 issue',
        recommended_action: 'refactor'
      })
    });

    const result = await analyzeCodeSmellTool.execute({ filePath: relativeTestFile });
    expect(result.content[0].text).toContain('Found 1 issue');
    expect(mockLLM.generate).toHaveBeenCalled();
  });

  it('should propose core update', async () => {
    const mockLLM = createLLM();
    (mockLLM.generate as any).mockResolvedValue({
      message: JSON.stringify({
        rationale: "Better performance",
        test_plan: "Run tests",
        revised_content: 'export const hello = () => "universe";'
      })
    });

    const result = await proposeCoreUpdateTool.execute({
      filePath: relativeTestFile,
      improvementDescription: "Change world to universe"
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.diff).toContain('universe');
    expect(parsed.rationale).toBe("Better performance");
  });

  it('should apply core update (Happy Path)', async () => {
    const mockLLM = createLLM();
    // Supervisor Approval
    (mockLLM.generate as any).mockResolvedValue({
      message: JSON.stringify({
        approved: true,
        reason: "Safe change",
        risk_level: "low"
      })
    });

    // Create a valid diff using createPatch
    const originalContent = 'export const hello = () => "world";';
    const newContent = 'export const hello = () => "universe";';
    const diff = createPatch(relativeTestFile, originalContent, newContent);

    // We can use yoloMode=true to skip human interaction for this test
    const result = await applyCoreUpdateTool.execute({
        filePath: relativeTestFile,
        diff: diff,
        summary: "Update to universe",
        yoloMode: true
    });

    expect(result.content[0].text).toContain("Successfully applied update");

    // Verify file content
    const content = await readFile(testFile, 'utf-8');
    expect(content).toBe('export const hello = () => "universe";');

    // Verify Backup
    const backupsDir = join(process.cwd(), '.agent', 'backups');
    const backups = await readdir(backupsDir);
    const backupFile = backups.find(f => f.startsWith('test_component.ts'));
    expect(backupFile).toBeDefined();
  });

  it('should reject update if Supervisor rejects', async () => {
    const mockLLM = createLLM();
    // Supervisor Rejection
    (mockLLM.generate as any).mockResolvedValue({
      message: JSON.stringify({
        approved: false,
        reason: "Dangerous change",
        risk_level: "high"
      })
    });

     const diff = `...`;

    const result = await applyCoreUpdateTool.execute({
        filePath: relativeTestFile,
        diff: diff,
        summary: "Bad update",
        yoloMode: true
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Supervisor REJECTED");
  });

  describe('SafetyProtocol Class', () => {
     it('should handle user rejection (mocked)', async () => {
         const mockUserApproval = {
             prompt: vi.fn().mockResolvedValue(false)
         };

         const safety = new SafetyProtocol(mockUserApproval);
         const mockLLM = createLLM();
         (mockLLM.generate as any).mockResolvedValue({
             message: JSON.stringify({ approved: true, reason: "ok", risk_level: "low" })
         });

         await expect(safety.verify(relativeTestFile, "diff", "summary", false))
            .rejects.toThrow("User rejected the update");

         expect(mockUserApproval.prompt).toHaveBeenCalled();
     });

     it('should handle user approval (mocked)', async () => {
         const mockUserApproval = {
             prompt: vi.fn().mockResolvedValue(true)
         };

         const safety = new SafetyProtocol(mockUserApproval);
         const mockLLM = createLLM();
         (mockLLM.generate as any).mockResolvedValue({
             message: JSON.stringify({ approved: true, reason: "ok", risk_level: "low" })
         });

         await expect(safety.verify(relativeTestFile, "diff", "summary", false))
            .resolves.not.toThrow();
     });
  });

  it('should auto-reject on timeout in default mode', async () => {
    const mockLLM = createLLM();
    (mockLLM.generate as any).mockResolvedValue({
      message: JSON.stringify({
        approved: true,
        reason: "Safe change",
        risk_level: "low"
      })
    });

    const diff = createPatch(relativeTestFile, "old", "new");

    // Use a very short timeout and yoloMode=false
    // This will use the REAL DefaultUserApproval which waits 50ms and resolves false.
    const result = await applyCoreUpdateTool.execute({
        filePath: relativeTestFile,
        diff: diff,
        summary: "Timeout test",
        yoloMode: false,
        autoDecisionTimeout: 50
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("User rejected the update");
  });
});
