
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateRepoMap } from '../src/repoMap.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

describe('Adaptive Repo Map', () => {
  const testDir = 'test_adaptive_map';

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    // Create 60 dummy files
    for (let i = 0; i < 60; i++) {
      await writeFile(join(testDir, `file_${i}.ts`), `export const x = ${i};`);
    }
    // Create specific target files
    await writeFile(join(testDir, 'auth_service.ts'), 'export class AuthService {}');
    await writeFile(join(testDir, 'user_controller.ts'), 'export class UserController {}');
    await writeFile(join(testDir, 'deeply_nested_auth.ts'), 'export class NestedAuth {}');
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should respect the 50 file limit', async () => {
    const map = await generateRepoMap(testDir);
    const lines = map.split('\n\n');
    expect(lines.length).toBeLessThanOrEqual(50);
  });

  it('should rank files matching keywords higher (exact filename match)', async () => {
    // Without keywords, it's just alphabetical or random
    // With 'auth', auth_service.ts and deeply_nested_auth.ts should appear
    const map = await generateRepoMap(testDir, ['auth']);
    expect(map).toContain('auth_service.ts');
    expect(map).toContain('deeply_nested_auth.ts');

    // Check if auth_service comes before file_0.ts (which has no match)
    // Note: generateRepoMap sorts by score desc.
    const indexAuth = map.indexOf('auth_service.ts');
    const indexFile0 = map.indexOf('file_0.ts');

    // If file_0 is even in the list (it might be dropped if we have > 50 files)
    if (indexFile0 !== -1) {
      expect(indexAuth).toBeLessThan(indexFile0);
    }
  });

  it('should rank files matching path keywords', async () => {
    const map = await generateRepoMap(testDir, ['nested']);
    expect(map).toContain('deeply_nested_auth.ts');

    const indexNested = map.indexOf('deeply_nested_auth.ts');
    const indexAuth = map.indexOf('auth_service.ts'); // partial match? no.
    // auth_service.ts score = 0
    // deeply_nested_auth.ts score = 5 (filename partial 'nested')

    if (indexAuth !== -1) {
      expect(indexNested).toBeLessThan(indexAuth);
    }
  });
});
