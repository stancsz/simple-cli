import { EventEmitter } from 'events';
import cron from 'node-cron';
import chokidar from 'chokidar';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { ScheduleConfig, TaskDefinition } from './daemon/task_definitions.js';
import { JobDelegator } from './scheduler/job_delegator.js';

interface SchedulerState {
  pendingTasks: TaskDefinition[];
}

export class Scheduler extends EventEmitter {
  private cronJobs: any[] = [];
  private taskFileWatchers: any[] = [];
  private scheduleWatcher: any;
  private scheduleFile: string;
  private stateFile: string;
  private delegator: JobDelegator;
  private pendingTasks: Map<string, TaskDefinition> = new Map();

  constructor(private agentDir: string) {
    super();
    this.scheduleFile = join(agentDir, 'scheduler.json');
    this.stateFile = join(agentDir, 'scheduler_state.json');
    this.delegator = new JobDelegator(agentDir);
  }

  async start() {
    await this.loadState();
    await this.ensureHRTask();
    await this.ensureMorningStandupTask();
    await this.ensureWeeklyReviewTask();

    // Resume pending tasks
    if (this.pendingTasks.size > 0) {
        console.log(`Resuming ${this.pendingTasks.size} pending tasks...`);
        const tasks = Array.from(this.pendingTasks.values());
        for (const task of tasks) {
            this.runTask(task).catch(e => console.error(`Resumed task failed: ${e}`));
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

  private async ensureHRTask() {
    let config: ScheduleConfig = { tasks: [] };
    if (existsSync(this.scheduleFile)) {
      try {
        const content = await readFile(this.scheduleFile, 'utf-8');
        config = JSON.parse(content);
      } catch (e) {
        // invalid file, start fresh
        config = { tasks: [] };
      }
    }

    const taskName = "Daily HR Review";
    // Check by ID first to avoid duplicates if name changes
    const hasHRTask = config.tasks?.some((t: any) => t.id === "hr-review");

    if (!hasHRTask) {
      console.log("Adding default Daily HR Review task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "hr-review",
          name: taskName,
          trigger: "cron",
          schedule: "0 3 * * *", // Daily at 03:00 UTC
          prompt: "Run the Daily HR Review using the 'analyze_logs' tool to analyze recent performance.",
          yoloMode: true
      });
      try {
          await writeFile(this.scheduleFile, JSON.stringify(config, null, 2));
      } catch (e) {
          console.error("Failed to write scheduler.json with default task:", e);
      }
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
    const hasTask = config.tasks?.some((t: any) => t.name === taskName);

    if (!hasTask) {
      console.log("Adding default Morning Standup task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "morning-standup",
          name: taskName,
          trigger: "cron",
          schedule: "0 9 * * *", // Daily at 9 AM
          prompt: "Run the Morning Standup review using the 'run_morning_standup' tool.",
          yoloMode: true
      });
      try {
          await writeFile(this.scheduleFile, JSON.stringify(config, null, 2));
      } catch (e) {
          console.error("Failed to write scheduler.json with default Morning Standup task:", e);
      }
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
    const hasTask = config.tasks?.some((t: any) => t.id === "weekly-hr-review");

    if (!hasTask) {
      console.log("Adding default Weekly HR Review task.");
      if (!config.tasks) config.tasks = [];
      config.tasks.push({
          id: "weekly-hr-review",
          name: taskName,
          trigger: "cron",
          schedule: "0 0 * * 0", // Weekly at Sunday midnight
          prompt: "Run the Weekly HR Review using the 'perform_weekly_review' tool to analyze long-term patterns.",
          yoloMode: true
      });
      try {
          await writeFile(this.scheduleFile, JSON.stringify(config, null, 2));
      } catch (e) {
          console.error("Failed to write scheduler.json with default Weekly HR Review task:", e);
      }
    }
  }

  private async runTask(task: TaskDefinition) {
      console.log(`Running task: ${task.name}`);
      this.pendingTasks.set(task.id, task);
      await this.saveState();

      try {
          await this.delegator.delegateTask(task);
      } catch (e) {
          console.error(`Task ${task.name} failed:`, e);
      } finally {
          this.pendingTasks.delete(task.id);
          await this.saveState();
      }
      this.emit('task-triggered', task);
  }

  private async saveState() {
      const state: SchedulerState = {
          pendingTasks: Array.from(this.pendingTasks.values())
      };
      try {
          await writeFile(this.stateFile, JSON.stringify(state, null, 2));
      } catch (e) {
          console.error("Failed to save scheduler state:", e);
      }
  }

  private async loadState() {
      if (!existsSync(this.stateFile)) return;
      try {
          const content = await readFile(this.stateFile, 'utf-8');
          const state: SchedulerState = JSON.parse(content);
          if (state.pendingTasks) {
              for (const task of state.pendingTasks) {
                  this.pendingTasks.set(task.id, task);
              }
          }
      } catch (e) {
          console.error("Failed to load scheduler state:", e);
      }
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
    if (!existsSync(this.scheduleFile)) {
      return { tasks: [] };
    }
    try {
      const content = await readFile(this.scheduleFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`Error reading schedule: ${e}`);
      return { tasks: [] };
    }
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
            } else {
                console.log(`Unknown trigger or missing config for task: ${task.name}`);
            }
        } catch (e: any) {
            console.error(`Error scheduling task ${task.name}: ${e.message}`);
        }
    }
  }
}
