/**
 * Terminal UI using Clack
 * Modern, clean terminal prompts and spinners
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';

export { p as prompts };

/**
 * UI Theme colors
 */
export const theme = {
  primary: pc.cyan,
  success: pc.green,
  warning: pc.yellow,
  error: pc.red,
  muted: pc.dim,
  highlight: pc.bold,
  code: pc.bgBlack,
};

/**
 * Display intro banner
 */
export function intro(message: string): void {
  p.intro(theme.primary(message));
}

/**
 * Display outro message
 */
export function outro(message: string): void {
  p.outro(theme.success(message));
}

/**
 * Display a note
 */
export function note(message: string, title?: string): void {
  p.note(message, title);
}

/**
 * Display a log message
 */
export function log(message: string): void {
  p.log.message(message);
}

/**
 * Display an info message
 */
export function info(message: string): void {
  p.log.info(theme.primary(message));
}

/**
 * Display a success message
 */
export function success(message: string): void {
  p.log.success(theme.success(message));
}

/**
 * Display a warning message
 */
export function warning(message: string): void {
  p.log.warn(theme.warning(message));
}

/**
 * Display an error message
 */
export function error(message: string): void {
  p.log.error(theme.error(message));
}

/**
 * Display a step message
 */
export function step(message: string): void {
  p.log.step(message);
}

/**
 * Show a spinner while executing an async operation
 */
export async function spin<T>(
  message: string,
  fn: () => Promise<T>
): Promise<T> {
  const s = p.spinner();
  s.start(message);

  try {
    const result = await fn();
    s.stop(theme.success('✓ ' + message));
    return result;
  } catch (err) {
    s.stop(theme.error('✗ ' + message));
    throw err;
  }
}

/**
 * Prompt for text input
 */
export async function text(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string | symbol> {
  return p.text(options);
}

/**
 * Prompt for password input
 */
export async function password(options: {
  message: string;
  validate?: (value: string) => string | undefined;
}): Promise<string | symbol> {
  return p.password(options);
}

/**
 * Prompt for confirmation
 */
export async function confirm(options: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean | symbol> {
  return p.confirm(options);
}

/**
 * Prompt for single selection
 */
export async function select<T extends string>(options: {
  message: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  initialValue?: T;
}): Promise<T | symbol> {
  return p.select(options as any);
}

/**
 * Prompt for multi-selection
 */
export async function multiselect<T extends string>(options: {
  message: string;
  options: Array<{ value: T; label: string; hint?: string }>;
  initialValues?: T[];
  required?: boolean;
}): Promise<T[] | symbol> {
  return p.multiselect(options as any);
}

/**
 * Group related prompts together
 */
export async function group<T extends Record<string, unknown>>(
  prompts: Record<keyof T, () => Promise<unknown>>,
  options?: { onCancel?: () => void }
): Promise<T> {
  return p.group(prompts as any, options) as unknown as Promise<T>;
}

/**
 * Check if user cancelled
 */
export function isCancel(value: unknown): value is symbol {
  return p.isCancel(value);
}

/**
 * Cancel and exit
 */
export function cancel(message?: string): void {
  p.cancel(message || 'Operation cancelled.');
  process.exit(0);
}

/**
 * Display a diff with syntax highlighting
 */
export function showDiff(diffText: string): void {
  const lines = diffText.split('\n');

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(theme.success(line));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(theme.error(line));
    } else if (line.startsWith('@@')) {
      console.log(theme.primary(line));
    } else if (line.startsWith('diff') || line.startsWith('index')) {
      console.log(theme.muted(line));
    } else {
      console.log(line);
    }
  }
}

/**
 * Display a code block
 */
export function showCode(code: string, language?: string): void {
  const header = language ? theme.muted(`\`\`\`${language}`) : theme.muted('```');
  const footer = theme.muted('```');

  console.log(header);
  console.log(code);
  console.log(footer);
}

/**
 * Display a thinking/reasoning block
 */
export function showThought(thought: string): void {
  const lines = thought.split('\n');
  const boxed = lines.map(line => theme.muted('│ ') + line).join('\n');

  console.log(theme.muted('┌─ Thinking'));
  console.log(boxed);
  console.log(theme.muted('└─'));
}

/**
 * Display a tool invocation
 */
export function showToolCall(name: string, args: Record<string, unknown>): void {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${theme.muted(k)}=${theme.highlight(JSON.stringify(v))}`)
    .join(' ');

  console.log(`${theme.primary('▶')} ${theme.highlight(name)} ${argsStr}`);
}

/**
 * Display a tool result
 */
export function showToolResult(result: string, truncate: number = 500): void {
  const display = result.length > truncate
    ? result.slice(0, truncate) + theme.muted(`\n... (${result.length - truncate} more chars)`)
    : result;

  console.log(theme.muted('◀ ') + display);
}

/**
 * Display file status indicators
 */
export function showFileStatus(files: Array<{ path: string; status: 'added' | 'modified' | 'deleted' | 'readonly' }>): void {
  const icons = {
    added: theme.success('+'),
    modified: theme.warning('~'),
    deleted: theme.error('-'),
    readonly: theme.muted('○'),
  };

  for (const file of files) {
    console.log(`  ${icons[file.status]} ${file.path}`);
  }
}

/**
 * Display token count
 */
export function showTokens(count: number, max?: number): void {
  const formatted = count.toLocaleString();

  if (max) {
    const percent = ((count / max) * 100).toFixed(1);
    const color = count / max > 0.8 ? theme.warning : theme.muted;
    console.log(color(`Tokens: ${formatted} / ${max.toLocaleString()} (${percent}%)`));
  } else {
    console.log(theme.muted(`Tokens: ~${formatted}`));
  }
}

/**
 * Create a task list for progress tracking
 */
export function tasks(): {
  add: (name: string, status?: 'pending' | 'running' | 'done' | 'error') => void;
  update: (name: string, status: 'pending' | 'running' | 'done' | 'error') => void;
  render: () => void;
} {
  const taskList: Map<string, 'pending' | 'running' | 'done' | 'error'> = new Map();

  const icons = {
    pending: theme.muted('○'),
    running: theme.primary('●'),
    done: theme.success('✓'),
    error: theme.error('✗'),
  };

  return {
    add(name: string, status: 'pending' | 'running' | 'done' | 'error' = 'pending') {
      taskList.set(name, status);
    },
    update(name: string, status: 'pending' | 'running' | 'done' | 'error') {
      taskList.set(name, status);
    },
    render() {
      for (const [name, status] of taskList) {
        console.log(`  ${icons[status]} ${name}`);
      }
    },
  };
}
