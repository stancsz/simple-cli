import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { generateJitAgent } from '../src/claw/jit.js';

// Mocks
const mockGenerateResponse = vi.fn();

vi.mock('../src/providers/index.js', () => ({
  createProvider: () => ({
    generateResponse: mockGenerateResponse
  })
}));

// Mock console to avoid clutter
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('JIT OpenClaw Compatibility', () => {
  const tmpDir = path.join(__dirname, 'tmp_claw_compat');
  const workspaceDir = path.join(tmpDir, 'workspace'); // Mock OpenClaw workspace
  const projectDir = path.join(tmpDir, 'project');

  beforeEach(() => {
    // Setup directories
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Mock environment variables
    process.env.CLAW_WORKSPACE = workspaceDir;

    // Reset mocks
    mockGenerateResponse.mockReset();
    mockGenerateResponse.mockResolvedValue({
      thought: 'Generating agent...',
      message: '# Generated Agent\nDo stuff.',
      raw: '# Generated Agent\nDo stuff.'
    });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.CLAW_WORKSPACE;
    vi.clearAllMocks();
  });

  it('should include content from SOUL.md in the prompt', async () => {
    // Create SOUL.md in workspace
    const soulContent = 'You are a Space Lobster. Clack clack.';
    fs.writeFileSync(path.join(workspaceDir, 'SOUL.md'), soulContent);

    // Call generateJitAgent
    await generateJitAgent('do something', projectDir);

    // Verify prompt
    expect(mockGenerateResponse).toHaveBeenCalled();
    const callArgs = mockGenerateResponse.mock.calls[0];
    const prompt = callArgs[1][0].content; // Messages[0].content

    expect(prompt).toContain('## OPENCLAW CONTEXT');
    expect(prompt).toContain('### SOUL.md (Core Persona/Directives)');
    expect(prompt).toContain(soulContent);
  });

  it('should include content from AGENTS.md in the prompt', async () => {
    // Create AGENTS.md in workspace
    const agentsContent = '- default: The standard agent.';
    fs.writeFileSync(path.join(workspaceDir, 'AGENTS.md'), agentsContent);

    // Call generateJitAgent
    await generateJitAgent('do something', projectDir);

    // Verify prompt
    expect(mockGenerateResponse).toHaveBeenCalled();
    const callArgs = mockGenerateResponse.mock.calls[0];
    const prompt = callArgs[1][0].content;

    expect(prompt).toContain('### AGENTS.md (Agent Registry)');
    expect(prompt).toContain(agentsContent);
  });

    it('should include content from TOOLS.md in the prompt', async () => {
    // Create TOOLS.md in workspace
    const toolsContent = '- tool1: does stuff';
    fs.writeFileSync(path.join(workspaceDir, 'TOOLS.md'), toolsContent);

    // Call generateJitAgent
    await generateJitAgent('do something', projectDir);

    // Verify prompt
    expect(mockGenerateResponse).toHaveBeenCalled();
    const callArgs = mockGenerateResponse.mock.calls[0];
    const prompt = callArgs[1][0].content;

    expect(prompt).toContain('### TOOLS.md (Tool Definitions)');
    expect(prompt).toContain(toolsContent);
  });

  it('should handle missing files gracefully', async () => {
     // No files created
     await generateJitAgent('do something', projectDir);

     const callArgs = mockGenerateResponse.mock.calls[0];
     const prompt = callArgs[1][0].content;

     expect(prompt).not.toContain('## OPENCLAW CONTEXT');
  });
});
