/**
 * Linter Tool - Checks code for syntax errors
 * Based on Aider's linter.py
 */

import { z } from 'zod';
import { execSync, spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import type { Tool } from '../registry.js';

// Input schema
export const inputSchema = z.object({
  path: z.string().describe('Path to file to lint'),
  fix: z.boolean().optional().default(false).describe('Attempt to auto-fix issues'),
});

type LinterInput = z.infer<typeof inputSchema>;

// Language detection based on file extension
const LANGUAGE_MAP: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

interface LintResult {
  file: string;
  language: string;
  errors: LintError[];
  warnings: LintError[];
  passed: boolean;
  output: string;
}

interface LintError {
  line: number;
  column?: number;
  message: string;
  rule?: string;
  severity: 'error' | 'warning';
}

// Detect language from file
function detectLanguage(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

// Parse error output for line numbers
function parseErrors(output: string, filePath: string): LintError[] {
  const errors: LintError[] = [];
  const fileName = basename(filePath);
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFilePath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Common patterns for error messages: file:line:col: message
  const patterns = [
    // Python/flake8/eslint style: file.py:10:5: E501 line too long
    { regex: new RegExp(`(?:${escapedFileName}|${escapedFilePath}):(\\d+)(?::(\\d+))?:\\s*(.+)`, 'gm'), groups: [1, 2, 3] },
    // TypeScript/tsc style: file.ts(10,5): error TS1234: message
    { regex: new RegExp(`(?:${escapedFileName}|${escapedFilePath})\\((\\d+),(\\d+)\\):\\s*(\\w+)\\s+(.+)`, 'gm'), groups: [1, 2, 4] },
    // Python py_compile style: File "file.py", line 10
    { regex: /File\s+"[^"]+",\s+line\s+(\d+)/gim, groups: [1] },
    // Generic line number: line 10: message
    { regex: /line\s+(\d+):\s*(.+)/gim, groups: [1, null, 2] },
  ];

  // Also capture standalone error messages like "SyntaxError: ..."
  const syntaxErrorMatch = output.match(/(SyntaxError|IndentationError|TabError):\s*(.+)/i);
  const syntaxErrorMessage = syntaxErrorMatch ? `${syntaxErrorMatch[1]}: ${syntaxErrorMatch[2]}` : null;

  for (const { regex, groups } of patterns) {
    let match;
    while ((match = regex.exec(output)) !== null) {
      const lineIdx = groups[0];
      const colIdx = groups[1];
      const msgIdx = groups[2];
      
      const line = parseInt(match[lineIdx], 10);
      const column = colIdx && match[colIdx] ? parseInt(match[colIdx], 10) : undefined;
      let message = msgIdx && match[msgIdx] ? match[msgIdx].trim() : '';
      
      // Use syntax error message if we found one and this pattern doesn't have a message
      if (!message && syntaxErrorMessage) {
        message = syntaxErrorMessage;
      }
      
      if (line > 0) {
        errors.push({
          line,
          column,
          message: message || 'Syntax error',
          severity: 'error',
        });
      }
    }
  }

  // Deduplicate errors by line number
  const seen = new Set<number>();
  return errors.filter(e => {
    if (seen.has(e.line)) return false;
    seen.add(e.line);
    return true;
  });
}

// Python syntax check using compile
function lintPython(filePath: string, code: string): LintResult {
  const errors: LintError[] = [];
  let output = '';

  // Try Python syntax check
  try {
    const result = spawnSync('python3', ['-m', 'py_compile', filePath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    
    if (result.status !== 0) {
      output = result.stderr || result.stdout || '';
      errors.push(...parseErrors(output, filePath));
    }
  } catch {
    // Fall back to basic syntax check
    try {
      execSync(`python3 -c "compile(open('${filePath}').read(), '${filePath}', 'exec')"`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch (e) {
      if (e instanceof Error) {
        output = e.message;
        errors.push(...parseErrors(output, filePath));
      }
    }
  }

  // Try flake8 for additional checks
  try {
    const result = spawnSync('python3', ['-m', 'flake8', '--select=E9,F821,F823,F831,F406,F407,F701,F702,F704,F706', filePath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    
    if (result.stdout) {
      output += '\n' + result.stdout;
      errors.push(...parseErrors(result.stdout, filePath));
    }
  } catch {
    // flake8 not available, skip
  }

  return {
    file: filePath,
    language: 'python',
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning'),
    passed: errors.filter(e => e.severity === 'error').length === 0,
    output: output.trim(),
  };
}

// JavaScript/TypeScript linting
function lintJavaScript(filePath: string, code: string, isTypeScript: boolean): LintResult {
  const errors: LintError[] = [];
  let output = '';
  const language = isTypeScript ? 'typescript' : 'javascript';

  // Basic syntax check using Node.js
  try {
    if (isTypeScript) {
      // Try tsc for TypeScript
      const result = spawnSync('npx', ['tsc', '--noEmit', '--skipLibCheck', filePath], {
        encoding: 'utf-8',
        timeout: 30000,
      });
      
      if (result.status !== 0) {
        output = (result.stdout || '') + (result.stderr || '');
        errors.push(...parseErrors(output, filePath));
      }
    } else {
      // Use Node's vm module for JavaScript syntax check
      const result = spawnSync('node', ['--check', filePath], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      
      if (result.status !== 0) {
        output = result.stderr || '';
        errors.push(...parseErrors(output, filePath));
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      output = e.message;
    }
  }

  // Try ESLint
  try {
    const result = spawnSync('npx', ['eslint', '--format', 'compact', filePath], {
      encoding: 'utf-8',
      timeout: 30000,
    });
    
    if (result.stdout) {
      output += '\n' + result.stdout;
      errors.push(...parseErrors(result.stdout, filePath));
    }
  } catch {
    // ESLint not available
  }

  return {
    file: filePath,
    language,
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning'),
    passed: errors.filter(e => e.severity === 'error').length === 0,
    output: output.trim(),
  };
}

// Go linting
function lintGo(filePath: string): LintResult {
  const errors: LintError[] = [];
  let output = '';

  try {
    const result = spawnSync('go', ['vet', filePath], {
      encoding: 'utf-8',
      timeout: 30000,
    });
    
    output = result.stderr + result.stdout;
    if (result.status !== 0) {
      errors.push(...parseErrors(output, filePath));
    }
  } catch (e) {
    if (e instanceof Error) {
      output = e.message;
    }
  }

  return {
    file: filePath,
    language: 'go',
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning'),
    passed: errors.filter(e => e.severity === 'error').length === 0,
    output: output.trim(),
  };
}

// Rust linting
function lintRust(filePath: string): LintResult {
  const errors: LintError[] = [];
  let output = '';

  try {
    const result = spawnSync('rustc', ['--emit=metadata', '-o', '/dev/null', filePath], {
      encoding: 'utf-8',
      timeout: 30000,
    });
    
    output = result.stderr + result.stdout;
    if (result.status !== 0) {
      errors.push(...parseErrors(output, filePath));
    }
  } catch (e) {
    if (e instanceof Error) {
      output = e.message;
    }
  }

  return {
    file: filePath,
    language: 'rust',
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning'),
    passed: errors.filter(e => e.severity === 'error').length === 0,
    output: output.trim(),
  };
}

// Generic shell linting
function lintShell(filePath: string): LintResult {
  const errors: LintError[] = [];
  let output = '';

  try {
    const result = spawnSync('bash', ['-n', filePath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    
    output = result.stderr + result.stdout;
    if (result.status !== 0) {
      errors.push(...parseErrors(output, filePath));
    }
  } catch (e) {
    if (e instanceof Error) {
      output = e.message;
    }
  }

  // Try shellcheck
  try {
    const result = spawnSync('shellcheck', ['-f', 'gcc', filePath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    
    if (result.stdout) {
      output += '\n' + result.stdout;
      errors.push(...parseErrors(result.stdout, filePath));
    }
  } catch {
    // shellcheck not available
  }

  return {
    file: filePath,
    language: 'shell',
    errors: errors.filter(e => e.severity === 'error'),
    warnings: errors.filter(e => e.severity === 'warning'),
    passed: errors.filter(e => e.severity === 'error').length === 0,
    output: output.trim(),
  };
}

// Execute linting
export async function execute(input: LinterInput): Promise<LintResult> {
  const { path: filePath } = inputSchema.parse(input);

  if (!existsSync(filePath)) {
    return {
      file: filePath,
      language: 'unknown',
      errors: [{ line: 0, message: 'File not found', severity: 'error' }],
      warnings: [],
      passed: false,
      output: 'File not found',
    };
  }

  const language = detectLanguage(filePath);
  const code = readFileSync(filePath, 'utf-8');

  switch (language) {
    case 'python':
      return lintPython(filePath, code);
    case 'javascript':
      return lintJavaScript(filePath, code, false);
    case 'typescript':
      return lintJavaScript(filePath, code, true);
    case 'go':
      return lintGo(filePath);
    case 'rust':
      return lintRust(filePath);
    case 'shell':
      return lintShell(filePath);
    default:
      return {
        file: filePath,
        language: language || 'unknown',
        errors: [],
        warnings: [],
        passed: true,
        output: `No linter available for ${language || 'unknown language'}`,
      };
  }
}

// Tool definition
export const tool: Tool = {
  name: 'lint',
  description: 'Check a source file for syntax errors and code quality issues. Supports Python, JavaScript, TypeScript, Go, Rust, and shell scripts.',
  inputSchema,
  permission: 'read',
  execute: async (args) => execute(args as LinterInput),
};
