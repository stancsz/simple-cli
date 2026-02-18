import { describe, it, expect } from 'vitest';
import { parseSOP } from '../../src/mcp_servers/sop_engine/sop_parser.js';

describe('SOP Parser', () => {
  it('should parse a simple SOP', () => {
    const markdown = `# Test SOP

Description of the SOP.

1. **Step One**
   Do something.
2. **Step Two**
   Do something else.
`;
    const sop = parseSOP(markdown);

    expect(sop.title).toBe('Test SOP');
    expect(sop.description).toBe('Description of the SOP.');
    expect(sop.steps).toHaveLength(2);
    expect(sop.steps[0].number).toBe(1);
    expect(sop.steps[0].name).toBe('Step One');
    expect(sop.steps[0].description).toBe('Do something.');
    expect(sop.steps[1].number).toBe(2);
    expect(sop.steps[1].name).toBe('Step Two');
  });

  it('should handle complex descriptions', () => {
    const markdown = `# Complex SOP

Line 1
Line 2

1. **Step 1**
   Line A
   Line B
`;
    const sop = parseSOP(markdown);
    expect(sop.description).toBe('Line 1\nLine 2');
    expect(sop.steps[0].description).toContain('Line A');
    expect(sop.steps[0].description).toContain('Line B');
  });

  it('should handle plain text step names', () => {
    const markdown = `
1. Step Name Here
   Description.
`;
    const sop = parseSOP(markdown);
    expect(sop.steps[0].name).toBe('Step Name Here');
    expect(sop.steps[0].description).toBe('Description.');
  });

  it('should handle name with colon separator', () => {
    const markdown = `
1. **Name**: Description starts here.
`;
    const sop = parseSOP(markdown);
    expect(sop.steps[0].name).toBe('Name');
    expect(sop.steps[0].description).toBe('Description starts here.');
  });

  it('should handle empty description', () => {
    const markdown = `
1. **Name**
`;
    const sop = parseSOP(markdown);
    expect(sop.steps[0].name).toBe('Name');
    expect(sop.steps[0].description).toBe('');
  });
});
