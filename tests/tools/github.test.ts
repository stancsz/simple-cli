import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute, inputSchema } from '../../src/tools/github.js';

describe('Github Tool', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GITHUB_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('should validate input schema', () => {
    const valid = {
      action: 'create_issue',
      owner: 'owner',
      repo: 'repo',
      title: 'title',
      body: 'body',
    };
    expect(inputSchema.parse(valid)).toEqual(valid);

    const invalid = {
      action: 'invalid',
    };
    expect(() => inputSchema.parse(invalid)).toThrow();
  });

  it('should return error object on invalid input schema via execute', async () => {
    const result = await execute({
      action: 'invalid',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error if token is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;

    const result = await execute({
      action: 'create_issue',
      owner: 'owner',
      repo: 'repo',
      title: 'title',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('GITHUB_TOKEN');
  });

  it('should create issue successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, title: 'test' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await execute({
      action: 'create_issue',
      owner: 'stancsz',
      repo: 'simple-cli',
      title: 'Test Issue',
      body: 'Body content',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/stancsz/simple-cli/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({ title: 'Test Issue', body: 'Body content' }),
      })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1, title: 'test' });
  });

  it('should handle API errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Bad credentials'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await execute({
      action: 'create_issue',
      owner: 'owner',
      repo: 'repo',
      title: 'title',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('401 Unauthorized');
  });
});
