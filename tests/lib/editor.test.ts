/**
 * Tests for intelligent code editor with fuzzy matching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  applyEdit,
  applyFileEdits,
  parseEditBlocks,
  EditBlock,
} from '../../src/lib/editor.js';

describe('editor', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-editor-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('applyEdit', () => {
    describe('exact match', () => {
      it('should replace exact match', () => {
        const content = 'function hello() {\n  return "world";\n}';
        const search = 'return "world"';
        const replace = 'return "universe"';

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.method).toBe('exact');
        expect(result.content).toContain('return "universe"');
      });

      it('should handle multiline exact match', () => {
        const content = `function test() {
  const x = 1;
  const y = 2;
  return x + y;
}`;
        const search = `const x = 1;
  const y = 2;`;
        const replace = `const x = 10;
  const y = 20;`;

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.content).toContain('const x = 10');
        expect(result.content).toContain('const y = 20');
      });
    });

    describe('whitespace-flexible match', () => {
      it('should match with different indentation', () => {
        const content = `class Test {
    method() {
        return true;
    }
}`;
        const search = `method() {
    return true;
}`;
        const replace = `method() {
    return false;
}`;

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.method).toBe('whitespace-flex');
        expect(result.content).toContain('return false');
      });

      it('should preserve surrounding indentation', () => {
        const content = `    indented line one
    indented line two
    indented line three`;
        const search = `indented line two`;
        const replace = `modified line two`;

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.content).toContain('    modified line two');
      });
    });

    describe('fuzzy match', () => {
      it('should find similar content', () => {
        const content = `function greet(name) {
  console.log("Hello " + name);
}`;
        // Slightly different (typo)
        const search = `function greet(name) {
  console.log("Hello" + name);
}`;
        const replace = `function greet(name) {
  console.log("Hi " + name);
}`;

        const result = applyEdit(content, search, replace);

        // Should use fuzzy matching due to minor difference
        expect(result.success).toBe(true);
        expect(result.method).toContain('fuzzy');
      });

      it('should provide suggestion for failed match', () => {
        const content = `const a = 1;
const b = 2;
const c = 3;`;
        const search = `const x = 1;
const y = 2;`;
        const replace = `const x = 10;`;

        const result = applyEdit(content, search, replace);

        // Should fail but provide suggestion
        if (!result.success) {
          expect(result.suggestion).toBeDefined();
        }
      });
    });

    describe('ellipsis handling', () => {
      it('should handle ... in search/replace', () => {
        const content = `function test() {
  // setup
  const x = 1;
  // middle
  const y = 2;
  // end
  return x + y;
}`;
        const search = `const x = 1;
...
const y = 2;`;
        const replace = `const x = 10;
...
const y = 20;`;

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.method).toBe('ellipsis');
        expect(result.content).toContain('const x = 10');
        expect(result.content).toContain('const y = 20');
        expect(result.content).toContain('// middle');
      });

      it('should append with trailing ...', () => {
        const content = `const a = 1;`;
        const search = ``;
        const replace = `const b = 2;`;

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.content).toContain('const a = 1');
        expect(result.content).toContain('const b = 2');
      });
    });

    describe('edge cases', () => {
      it('should handle empty content', () => {
        const result = applyEdit('', '', 'new content');

        expect(result.success).toBe(true);
        expect(result.content).toBe('new content');
      });

      it('should normalize line endings', () => {
        const content = 'line1\r\nline2\r\nline3';
        const search = 'line2';
        const replace = 'modified';

        const result = applyEdit(content, search, replace);

        expect(result.success).toBe(true);
        expect(result.content).toContain('modified');
      });
    });
  });

  describe('applyFileEdits', () => {
    it('should apply edits to file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'original content');

      const edits: EditBlock[] = [
        { file: filePath, search: 'original', replace: 'modified' },
      ];

      const results = await applyFileEdits(edits);

      expect(results[0].success).toBe(true);
      expect(results[0].applied).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('modified content');
    });

    it('should apply multiple edits to same file', async () => {
      const filePath = join(testDir, 'multi.txt');
      await writeFile(filePath, 'aaa bbb ccc');

      const edits: EditBlock[] = [
        { file: filePath, search: 'aaa', replace: 'AAA' },
        { file: filePath, search: 'bbb', replace: 'BBB' },
      ];

      const results = await applyFileEdits(edits);

      expect(results.every(r => r.success)).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('AAA');
      expect(content).toContain('BBB');
    });

    it('should create new file with empty search', async () => {
      const filePath = join(testDir, 'new/nested/file.txt');

      const edits: EditBlock[] = [
        { file: filePath, search: '', replace: 'new file content' },
      ];

      const results = await applyFileEdits(edits);

      expect(results[0].success).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('new file content');
    });

    it('should report failed edits', async () => {
      const filePath = join(testDir, 'fail.txt');
      await writeFile(filePath, 'some content');

      const edits: EditBlock[] = [
        { file: filePath, search: 'nonexistent', replace: 'replaced' },
      ];

      const results = await applyFileEdits(edits);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it('should generate diff for applied edits', async () => {
      const filePath = join(testDir, 'diff.txt');
      await writeFile(filePath, 'line 1\nline 2\nline 3');

      const edits: EditBlock[] = [
        { file: filePath, search: 'line 2', replace: 'modified line' },
      ];

      const results = await applyFileEdits(edits);

      expect(results[0].diff).toBeDefined();
      expect(results[0].diff).toContain('-line 2');
      expect(results[0].diff).toContain('+modified line');
    });
  });

  describe('parseEditBlocks', () => {
    it('should parse standard format', () => {
      const response = `
Here's the change:

src/index.ts
\`\`\`typescript
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE
\`\`\`
`;

      const blocks = parseEditBlocks(response);

      expect(blocks.length).toBe(1);
      expect(blocks[0].file).toBe('src/index.ts');
      expect(blocks[0].search).toContain('const x = 1');
      expect(blocks[0].replace).toContain('const x = 2');
    });

    it('should parse multiple blocks', () => {
      const response = `
file1.ts
\`\`\`
<<<<<<< SEARCH
old1
=======
new1
>>>>>>> REPLACE
\`\`\`

file2.ts
\`\`\`
<<<<<<< SEARCH
old2
=======
new2
>>>>>>> REPLACE
\`\`\`
`;

      const blocks = parseEditBlocks(response);

      expect(blocks.length).toBe(2);
      expect(blocks[0].file).toBe('file1.ts');
      expect(blocks[1].file).toBe('file2.ts');
    });

    it('should handle format without code fence', () => {
      const response = `
src/test.ts
<<<<<<< SEARCH
function test() {}
=======
function test() { return true; }
>>>>>>> REPLACE
`;

      const blocks = parseEditBlocks(response);

      expect(blocks.length).toBe(1);
    });

    it('should match against valid files', () => {
      const response = `
index.ts
\`\`\`
<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE
\`\`\`
`;

      const validFiles = ['src/index.ts', 'lib/index.ts'];
      const blocks = parseEditBlocks(response, validFiles);

      expect(blocks[0].file).toBe('src/index.ts');
    });

    it('should clean up filename', () => {
      const response = `
### \`src/file.ts\`
\`\`\`
<<<<<<< SEARCH
x
=======
y
>>>>>>> REPLACE
\`\`\`
`;

      const blocks = parseEditBlocks(response);

      expect(blocks[0].file).toBe('src/file.ts');
    });
  });
});
