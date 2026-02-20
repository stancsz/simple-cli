import { EventEmitter } from 'events';
import cron from 'node-cron';
import chokidar from 'chokidar';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { ScheduleConfig, TaskDefinition } from './interfaces/daemon.js';
import { JobDelegator } from './scheduler/job_delegator.js';
import { StateManager } from './daemon/state_manager.js';

const MCP_CONFIG_FILE = join(process.cwd(), 'mcp.json');

export class Scheduler extends EventEmitter {
  private cronJobs: any[] = [];
  private taskFileWatchers: any[] = [];
  private scheduleWatcher: any;
  private scheduleFile: string;
  private delegator: JobDelegator;
  private pendingTasks: Map<string, TaskDefinition> = new Map();

  constructor(private agentDir: string) {
    super();
    this.scheduleFile = join(agentDir, 'scheduler.json');
    this.delegator = new JobDelegator(agentDir);
  }

  async start() {
    // Resume tasks from Daemon State
    const stateManager = new StateManager(this.agentDir);
    const state = await stateManager.loadState();

    // Load config first to have definitions
    await this.ensureHRTask();
    await this.ensureMorningStandupTask();
    await this.ensureWeeklyReviewTask();
    const config = await this.loadSchedule();

    if (state.activeTasks && state.activeTasks.length > 0) {
        console.log(`[Scheduler] Found ${state.activeTasks.length} active tasks in state.`);

        for (const activeTask of state.activeTasks) {
            const taskDef = config.tasks.find(t => t.id === activeTask.id);
            if (taskDef) {
                 console.log(`[Scheduler] Resuming task: ${taskDef.name}`);
                 // Run async
                 this.runTask(taskDef).catch(e => console.error(`Resumed task failed: ${e}`));
            } else {
                 console.log(`[Scheduler] Could not resume task ${activeTask.id} (definition not found). Cleaning up.`);
                 // Emit removal so Daemon updates state
                 this.emitStateAction('remove', { taskId: activeTask.id });
            }
        }
    }

    await this.applySchedule();

    // Watch schedule file for changes
    if (existsSync(this.scheduleFile)) {
        this.watchScheduleFile();
    } else {
        // Watch directory for creation of scheduler.json
        if (existsSync(this.agentDir)) {
             const dirWatcher = chokidar.watch(this.agentDir, { persistent: true, ignoreInitial: true });
             dirWatcher.on('add', (path) => {
                 if (path === this.scheduleFile) {
                     this.watchScheduleFile();
                     this.applySchedule();
                     dirWatcher.close();
                 }
             });
        }
    }
  }

  private emitStateAction(action: 'add' | 'remove', data: any) {
      // Format: [STATE_ACTION] {"type":"STATE_ACTION","action":"...","task":...}
      // Daemon listens for this format in stdout
      const payload = {
          type: 'STATE_ACTION',
          action,
          ...data
      };
      console.log(`[STATE_ACTION] ${JSON.stringify(payload)}`);
  }

  private async ensureHRTask() {
    let config: ScheduleConfig = { tasks: [] };
    if (existsSync(this.scheduleFile)) {
      try {
        const content = await readFile(this.scheduleFile, 'utf-8');
        config = JSON.parse(content);
      } catch (e) {
        config = { tasks: [] };
      }
    }

    const taskName = "Daily HR Review";
    if (!config.tasks?.some((t: any) => t.id === "hr-review")) {
      console.log("Adding default Daily HR Review task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "hr-review",
          name: taskName,
          trigger: "cron",
          schedule: "0 3 * * *",
          prompt: "Run the Daily HR Review using the 'analyze_logs' tool to analyze recent performance.",
          yoloMode: true
      });
      try { await writeFile(this.scheduleFile, JSON.stringify(config, null, 2)); } catch (e) {}
    }
  }

  private async ensureMorningStandupTask() {
    let config: ScheduleConfig = { tasks: [] };
    if (existsSync(this.scheduleFile)) {
      try {
        const content = await readFile(this.scheduleFile, 'utf-8');
        config = JSON.parse(content);
      } catch (e) {
        config = { tasks: [] };
      }
    }

    const taskName = "Morning Standup";
    if (!config.tasks?.some((t: any) => t.id === "morning-standup")) {
      console.log("Adding default Morning Standup task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "morning-standup",
          name: taskName,
          trigger: "cron",
          schedule: "0 9 * * *",
          prompt: "Run the Morning Standup review using the 'run_morning_standup' tool.",
          yoloMode: true
      });
      try { await writeFile(this.scheduleFile, JSON.stringify(config, null, 2)); } catch (e) {}
    }
  }

  private async ensureWeeklyReviewTask() {
    let config: ScheduleConfig = { tasks: [] };
    if (existsSync(this.scheduleFile)) {
      try {
        const content = await readFile(this.scheduleFile, 'utf-8');
        config = JSON.parse(content);
      } catch (e) {
        config = { tasks: [] };
      }
    }

    const taskName = "Weekly HR Review";
    if (!config.tasks?.some((t: any) => t.id === "weekly-hr-review")) {
      console.log("Adding default Weekly HR Review task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "weekly-hr-review",
          name: taskName,
          trigger: "cron",
          schedule: "0 0 * * 0",
          prompt: "Run the Weekly HR Review using the 'perform_weekly_review' tool to analyze long-term patterns.",
          yoloMode: true
      });
      try { await writeFile(this.scheduleFile, JSON.stringify(config, null, 2)); } catch (e) {}
    }
  }

  private async runTask(task: TaskDefinition) {
      console.log(`[Scheduler] Running task: ${task.name}`);
      this.pendingTasks.set(task.id, task);

      // Notify Daemon to update state
      this.emitStateAction('add', {
          task: {
              id: task.id,
              name: task.name,
              startTime: Date.now()
          }
      });

      try {
          await this.delegator.delegateTask(task);
      } catch (e) {
          console.error(`Task ${task.name} failed:`, e);
      } finally {
          this.pendingTasks.delete(task.id);
          // Notify Daemon to update state
          this.emitStateAction('remove', { taskId: task.id });
      }
      this.emit('task-triggered', task);
  }

  private watchScheduleFile() {
      if (this.scheduleWatcher) return;
      this.scheduleWatcher = chokidar.watch(this.scheduleFile, { persistent: true, ignoreInitial: true });
      this.scheduleWatcher.on('change', async () => {
          console.log("Schedule file changed. Reloading...");
          await this.applySchedule();
      });
  }

  async stop() {
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    await Promise.all(this.taskFileWatchers.map(w => w.close()));
    this.taskFileWatchers = [];
    if (this.scheduleWatcher) {
        await this.scheduleWatcher.close();
        this.scheduleWatcher = null;
    }
  }

  private async loadSchedule(): Promise<ScheduleConfig> {
    const tasks: TaskDefinition[] = [];

    // 1. Load from mcp.json (Primary)
    if (existsSync(MCP_CONFIG_FILE)) {
        try {
            const content = await readFile(MCP_CONFIG_FILE, 'utf-8');
            const config = JSON.parse(content);
            if (config.scheduledTasks && Array.isArray(config.scheduledTasks)) {
                tasks.push(...config.scheduledTasks);
            }
        } catch (e) {
            console.error(`Error reading mcp.json: ${e}`);
        }
    }

    // 2. Load from scheduler.json (Legacy/Fallback)
    if (existsSync(this.scheduleFile)) {
      try {
        const content = await readFile(this.scheduleFile, 'utf-8');
        const legacyConfig = JSON.parse(content);
        if (legacyConfig.tasks && Array.isArray(legacyConfig.tasks)) {
            // Avoid duplicates by ID
            const existingIds = new Set(tasks.map(t => t.id));
            legacyConfig.tasks.forEach((t: TaskDefinition) => {
                if (!existingIds.has(t.id)) {
                    tasks.push(t);
                }
            });
        }
      } catch (e) {
        console.error(`Error reading scheduler.json: ${e}`);
      }
    }

    return { tasks };
  }

  private async applySchedule() {
    // Clear existing
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    await Promise.all(this.taskFileWatchers.map(w => w.close()));
    this.taskFileWatchers = [];

    const config = await this.loadSchedule();
    const tasks = config.tasks || [];

    console.log(`Loaded ${tasks.length} tasks.`);

    for (const task of tasks) {
        try {
            if (task.trigger === 'cron' && task.schedule) {
                if (cron.validate(task.schedule)) {
                    const job = cron.schedule(task.schedule, () => {
                        console.log(`Cron triggered for task: ${task.name}`);
                        this.runTask(task);
                    });
                    this.cronJobs.push(job);
                    console.log(`Scheduled cron task: ${task.name} at "${task.schedule}"`);
                } else {
                    console.error(`Invalid cron schedule for task: ${task.name}`);
                }
            } else if (task.trigger === 'file-watch' && task.path) {
                const watchPath = join(process.cwd(), task.path);
                const watcher = chokidar.watch(watchPath, { persistent: true, ignoreInitial: true });
                watcher.on('change', (path) => {
                    console.log(`File changed: ${path}. Triggering task ${task.name}`);
                    this.runTask(task);
                });
                this.taskFileWatchers.push(watcher);
                console.log(`Watching file: ${watchPath} for task: ${task.name}`);
            } else if (task.trigger === 'webhook') {
                console.log(`Webhook trigger not implemented for task: ${task.name}`);
            }
        } catch (e: any) {
            console.error(`Error scheduling task ${task.name}: ${e.message}`);
        }
    }
  }
}
