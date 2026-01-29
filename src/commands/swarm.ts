/**
 * Swarm Command - Run multiple agents in parallel
 */

import { readFileSync, existsSync } from 'fs';
import { SwarmCoordinator, type SwarmTask, type CoordinatorOptions } from '../swarm/index.js';
import { execute as globExecute } from '../tools/glob.js';

export interface SwarmCliOptions {
  tasksFile?: string;
  task?: string;
  scope?: string;
  concurrency?: number;
  timeout?: number;
  yolo?: boolean;
  branch?: string;
}

/**
 * Parse swarm options from command line arguments
 */
export function parseSwarmArgs(args: string[]): SwarmCliOptions {
  const options: SwarmCliOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--tasks' && args[i + 1]) {
      options.tasksFile = args[++i];
    } else if (arg === '--task' && args[i + 1]) {
      options.task = args[++i];
    } else if (arg === '--scope' && args[i + 1]) {
      options.scope = args[++i];
    } else if (arg === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[++i], 10);
    } else if (arg === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--branch' && args[i + 1]) {
      options.branch = args[++i];
    } else if (arg === '--yolo') {
      options.yolo = true;
    } else if (!arg.startsWith('--') && !options.tasksFile && existsSync(arg)) {
      // Positional argument - tasks file
      options.tasksFile = arg;
    }
  }
  
  return options;
}

/**
 * Load tasks from a JSON file
 */
export function loadTasksFromFile(filePath: string): { tasks: SwarmTask[]; options?: Partial<CoordinatorOptions> } {
  if (!existsSync(filePath)) {
    throw new Error(`Tasks file not found: ${filePath}`);
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  // Support both { tasks: [...] } and [...] formats
  if (Array.isArray(data)) {
    return { tasks: data };
  }
  
  const tasks = data.tasks || [];
  const options: Partial<CoordinatorOptions> = {};
  
  if (data.session) {
    if (data.session.concurrency) options.concurrency = data.session.concurrency;
    if (data.session.timeout) options.timeout = data.session.timeout;
    if (data.session.branch) options.branch = data.session.branch;
  }
  
  return { tasks, options };
}

/**
 * Create tasks from a glob pattern
 */
export async function createTasksFromScope(
  task: string,
  scope: string,
  type: SwarmTask['type'] = 'implement'
): Promise<SwarmTask[]> {
  const result = await globExecute({ pattern: scope, maxResults: 100, includeDirectories: false });
  
  return result.matches.map((file, i) => ({
    id: `task-${i}`,
    type,
    description: `${task} in ${file}`,
    scope: { files: [file] },
    dependencies: [],
    priority: 2 as const,
    timeout: 300000,
    retries: 2,
  }));
}

/**
 * Run swarm orchestrator
 */
export async function runSwarm(options: SwarmCliOptions): Promise<void> {
  console.log('\n🐝 Simple-CLI Swarm Mode\n');
  
  let tasks: SwarmTask[] = [];
  let coordinatorOptions: Partial<CoordinatorOptions> = {};
  
  // Load tasks from file or create from options
  if (options.tasksFile) {
    console.log(`📄 Loading tasks from ${options.tasksFile}...`);
    const loaded = loadTasksFromFile(options.tasksFile);
    tasks = loaded.tasks;
    coordinatorOptions = loaded.options || {};
  } else if (options.task && options.scope) {
    console.log(`🔍 Creating tasks from scope: ${options.scope}...`);
    tasks = await createTasksFromScope(options.task, options.scope);
  } else if (options.task) {
    // Single task
    tasks = [{
      id: 'single-task',
      type: 'implement',
      description: options.task,
      scope: {},
      dependencies: [],
      priority: 1,
      timeout: options.timeout || 300000,
      retries: 2,
    }];
  }
  
  if (tasks.length === 0) {
    console.error('❌ No tasks to run. Provide --tasks <file> or --task "description"');
    process.exit(1);
  }
  
  console.log(`📋 ${tasks.length} task(s) to execute\n`);
  
  // Apply CLI options
  if (options.concurrency) coordinatorOptions.concurrency = options.concurrency;
  if (options.timeout) coordinatorOptions.timeout = options.timeout;
  if (options.branch) coordinatorOptions.branch = options.branch;
  if (options.yolo !== undefined) coordinatorOptions.yolo = options.yolo;
  
  // Create coordinator
  const coordinator = new SwarmCoordinator({
    cwd: process.cwd(),
    ...coordinatorOptions,
  });
  
  // Add event handlers
  coordinator.on('task:start', (task, workerId) => {
    console.log(`🚀 [${workerId}] Starting: ${task.description.slice(0, 60)}...`);
  });
  
  coordinator.on('task:complete', (task, result) => {
    const status = result.success ? '✅' : '⚠️';
    console.log(`${status} [${task.id}] Done in ${result.duration}ms`);
    if (result.filesChanged.length > 0) {
      console.log(`   Files: ${result.filesChanged.join(', ')}`);
    }
  });
  
  coordinator.on('task:fail', (task, error) => {
    console.error(`❌ [${task.id}] Failed: ${error.message}`);
  });
  
  coordinator.on('task:retry', (task, attempt) => {
    console.log(`🔄 [${task.id}] Retry attempt ${attempt}`);
  });
  
  // Add tasks
  coordinator.addTasks(tasks);
  
  // Run swarm
  const startTime = Date.now();
  console.log(`⏱️  Starting swarm with concurrency: ${coordinatorOptions.concurrency || 4}\n`);
  
  try {
    const result = await coordinator.run();
    
    // Print summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 SWARM COMPLETE');
    console.log('═'.repeat(50));
    console.log(`   Total Tasks:    ${result.total}`);
    console.log(`   Completed:      ${result.completed} ✅`);
    console.log(`   Failed:         ${result.failed} ❌`);
    console.log(`   Skipped:        ${result.skipped} ⏭️`);
    console.log(`   Duration:       ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`   Success Rate:   ${(result.successRate * 100).toFixed(1)}%`);
    
    if (result.failedTasks.length > 0) {
      console.log('\n❌ Failed Tasks:');
      for (const f of result.failedTasks) {
        console.log(`   - ${f.task.id}: ${f.error}`);
      }
    }
    
    console.log('═'.repeat(50) + '\n');
    
    // Exit with error code if any failures
    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Swarm error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * Print swarm help
 */
export function printSwarmHelp(): void {
  console.log(`
🐝 Simple-CLI Swarm Mode

USAGE
  simple-cli --swarm [options]

OPTIONS
  --tasks <file>       Load tasks from JSON file
  --task "desc"        Single task description
  --scope "pattern"    Glob pattern for files (creates task per file)
  --concurrency <n>    Max parallel workers (default: 4)
  --timeout <ms>       Task timeout in milliseconds
  --branch <name>      Git branch for changes
  --yolo               Auto-approve all actions

EXAMPLES
  # Run tasks from file
  simple-cli --swarm --tasks tasks.json

  # Single task
  simple-cli --swarm --yolo --task "add tests to all files"

  # Task per file matching pattern
  simple-cli --swarm --yolo --task "add JSDoc" --scope "src/**/*.ts"

  # With concurrency limit
  simple-cli --swarm --concurrency 2 --tasks tasks.json

TASKS FILE FORMAT
  {
    "session": {
      "concurrency": 4,
      "timeout": 300000,
      "branch": "feature/swarm"
    },
    "tasks": [
      {
        "id": "task-1",
        "type": "implement",
        "description": "Add validation",
        "scope": { "files": ["src/api.ts"] },
        "priority": 1,
        "timeout": 60000,
        "retries": 2
      }
    ]
  }
`);
}
