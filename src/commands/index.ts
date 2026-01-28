import { Command, Flags } from '@oclif/core';
import * as ui from '../lib/ui.js';
import { Agent, summarizeHistory } from '../lib/agent.js';
import { GitManager, getGitManager } from '../lib/git.js';
import { ContextManager, getContextManager, Message } from '../context.js';
import { loadAllTools, getToolDefinitions } from '../registry.js';
import { createProvider } from '../providers/index.js';
import { createMultiProvider } from '../providers/multi.js';
import { routeTask, loadTierConfig, type Tier } from '../router.js';
import { getMCPManager } from '../mcp/manager.js';
import { getActiveSkill, setActiveSkill, listSkills } from '../skills.js';
import { FileWatcher, createFileWatcher } from '../watcher.js';
import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';

export default class Chat extends Command {
  static description = 'Start an interactive coding session';

  static flags = {
    yolo: Flags.boolean({
      description: 'Auto-approve all tool executions',
      default: false,
    }),
    moe: Flags.boolean({
      description: 'Enable Mix of Experts routing',
      default: false,
    }),
    watch: Flags.boolean({
      description: 'Watch files for AI comments',
      default: false,
    }),
    skill: Flags.string({
      description: 'Initial skill/mode (code, architect, test, etc.)',
      default: 'code',
    }),
    'auto-commit': Flags.boolean({
      description: 'Auto-commit after successful changes',
      default: false,
    }),
    'auto-lint': Flags.boolean({
      description: 'Auto-lint after file changes',
      default: true,
    }),
    'auto-test': Flags.boolean({
      description: 'Auto-run tests after changes',
      default: false,
    }),
    'test-cmd': Flags.string({
      description: 'Test command to run',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Chat);

    // Show banner
    ui.intro('Simple-CLI v0.2.0');
    ui.log(`Mode: ${flags.moe ? 'MoE' : 'Single'} | ${flags.yolo ? 'YOLO' : 'Safe'} | Skill: @${flags.skill}`);

    // Initialize context
    const ctx = getContextManager();
    await ctx.initialize();
    ui.success(`Loaded ${ctx.getTools().size} tools`);

    // Set initial skill
    const skill = setActiveSkill(flags.skill);
    if (skill) {
      ctx.setSkill(skill);
    }

    // Initialize git
    const git = getGitManager();
    const isGitRepo = await git.isRepo();
    if (isGitRepo) {
      const branch = await git.currentBranch();
      ui.log(`Git: ${branch || 'detached HEAD'}`);
    }

    // Initialize MCP
    const mcpManager = getMCPManager();
    try {
      const configs = await mcpManager.loadConfig();
      if (configs.length > 0) {
        await ui.spin(`Connecting to ${configs.length} MCP server(s)`, async () => {
          await mcpManager.connectAll(configs);
        });
      }
    } catch {
      // MCP not configured
    }

    // Initialize providers
    const tierConfigs = flags.moe ? loadTierConfig() : null;
    const multiProvider = tierConfigs ? createMultiProvider(tierConfigs) : null;
    const singleProvider = !flags.moe ? createProvider() : null;

    // Initialize file watcher
    let watcher: FileWatcher | null = null;
    if (flags.watch) {
      watcher = createFileWatcher({
        root: ctx.getCwd(),
        onAIComment: (path, comments) => {
          ui.note(
            comments.map(c => `Line ${c.line}: ${c.text}`).join('\n'),
            `AI Comments in ${path}`
          );
        },
      });
      ui.success('File watcher active');
    }

    // Generate function
    const generate = async (messages: Message[]): Promise<string> => {
      const systemPrompt = await ctx.buildSystemPrompt();
      const rules = loadAgentRules();
      const fullPrompt = rules ? `${systemPrompt}\n\n## Project Rules\n${rules}` : systemPrompt;

      const llmMessages = messages.map(m => ({ role: m.role, content: m.content }));

      if (flags.moe && multiProvider && tierConfigs) {
        const userMsg = messages.find(m => m.role === 'user')?.content || '';
        const routing = await routeTask(userMsg, async (prompt) => {
          return multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: userMsg }]);
        });
        return multiProvider.generateWithTier(routing.tier as Tier, fullPrompt, llmMessages);
      }

      return singleProvider!.generateResponse(fullPrompt, llmMessages);
    };

    // Tool execution
    const executeTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const tools = ctx.getTools();
      const tool = tools.get(name);

      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      // Permission check
      if (!flags.yolo && tool.permission !== 'read') {
        const confirmed = await ui.confirm({
          message: `Execute ${name}?`,
          initialValue: false,
        });

        if (ui.isCancel(confirmed) || !confirmed) {
          return 'Cancelled by user';
        }
      }

      return tool.execute(args);
    };

    // Create agent
    const agent = new Agent({
      config: {
        maxReflections: 3,
        autoLint: flags['auto-lint'],
        autoTest: flags['auto-test'],
        autoCommit: flags['auto-commit'],
        testCommand: flags['test-cmd'],
      },
      git,
      generateFn: generate,
      executeTool,
      lintFn: flags['auto-lint'] ? async (file: string) => {
        const { execute } = await import('../tools/linter.js');
        const result = await execute({ path: file, fix: false });
        return { passed: result.passed, output: result.output };
      } : undefined,
      testFn: flags['auto-test'] && flags['test-cmd'] ? async () => {
        const { execute } = await import('../tools/runCommand.js');
        const result = await execute({ command: flags['test-cmd']! });
        return { passed: result.exitCode === 0, output: result.stdout + result.stderr };
      } : undefined,
    });

    // Main loop
    while (true) {
      const currentSkill = getActiveSkill();
      const input = await ui.text({
        message: `[${currentSkill.name}]`,
        placeholder: 'Type a message or /help...',
      });

      if (ui.isCancel(input)) {
        break;
      }

      const message = (input as string).trim();
      if (!message) continue;

      // Handle slash commands
      if (message.startsWith('/')) {
        await handleCommand(message, ctx, git, mcpManager);
        continue;
      }

      // Handle skill switching
      if (message.startsWith('@')) {
        const skillName = message.slice(1).trim();
        if (skillName === 'list') {
          ui.note(
            listSkills().map(s => `@${s.name} - ${s.description}`).join('\n'),
            'Available Skills'
          );
        } else {
          const newSkill = setActiveSkill(skillName);
          if (newSkill) {
            ctx.setSkill(newSkill);
            ui.success(`Switched to @${newSkill.name}`);
          } else {
            ui.error(`Unknown skill: @${skillName}`);
          }
        }
        continue;
      }

      // Add watch context if available
      let fullMessage = message;
      if (watcher) {
        const watchPrompt = watcher.getActionableCommentsPrompt();
        if (watchPrompt) {
          fullMessage = `${watchPrompt}\n\nUser request: ${message}`;
        }
      }

      // Process with agent
      try {
        ctx.addMessage('user', message);
        const history = ctx.getHistory();

        // Summarize if too long
        const summarizedHistory = await summarizeHistory(history, generate, 20);

        const systemPrompt = await ctx.buildSystemPrompt();
        const result = await agent.process(fullMessage, summarizedHistory, systemPrompt);

        // Add response to history
        if (result.response.action && 'message' in result.response.action) {
          ctx.addMessage('assistant', result.response.action.message);
        }
      } catch (error) {
        ui.error(`Error: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Cleanup
    watcher?.stop();
    await mcpManager.disconnectAll();
    ui.outro('Goodbye!');
  }
}

/**
 * Handle slash commands
 */
async function handleCommand(
  input: string,
  ctx: ContextManager,
  git: GitManager,
  mcpManager: ReturnType<typeof getMCPManager>
): Promise<void> {
  const [cmd, ...args] = input.slice(1).split(/\s+/);
  const argsStr = args.join(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
    case 'h':
      ui.note(`
/add <file>     - Add file to context
/drop [file]    - Remove file from context
/ls             - List files in context
/clear          - Clear chat history
/diff           - Show git diff
/status         - Show git status
/commit [msg]   - Commit changes
/undo           - Undo last commit
/tokens         - Show token estimate
/mcp [cmd]      - MCP management
/skill <name>   - Switch skill
/exit           - Exit
`, 'Commands');
      break;

    case 'add':
    case 'a':
      if (argsStr) {
        const added = ctx.addFile(argsStr);
        if (added) {
          ui.success(`Added ${argsStr}`);
        } else {
          ui.error(`File not found: ${argsStr}`);
        }
      } else {
        ui.error('Usage: /add <file>');
      }
      break;

    case 'drop':
    case 'd':
      if (argsStr) {
        ctx.removeFile(argsStr);
        ui.success(`Dropped ${argsStr}`);
      } else {
        // Drop all
        const files = ctx.getFiles();
        for (const f of [...files.active, ...files.readOnly]) {
          ctx.removeFile(f);
        }
        ui.success('Dropped all files');
      }
      break;

    case 'ls':
    case 'files':
      const files = ctx.getFiles();
      if (files.active.length === 0 && files.readOnly.length === 0) {
        ui.log('No files in context');
      } else {
        ui.showFileStatus([
          ...files.active.map(f => ({ path: f, status: 'modified' as const })),
          ...files.readOnly.map(f => ({ path: f, status: 'readonly' as const })),
        ]);
      }
      break;

    case 'clear':
      ctx.clearHistory();
      ui.success('Chat history cleared');
      break;

    case 'diff':
      const diff = await git.diff();
      if (diff) {
        ui.showDiff(diff);
      } else {
        ui.log('No changes');
      }
      break;

    case 'status':
      const status = await git.status();
      ui.log(`Branch: ${status.current}`);
      if (status.modified.length) ui.log(`Modified: ${status.modified.join(', ')}`);
      if (status.created.length) ui.log(`Created: ${status.created.join(', ')}`);
      if (status.deleted.length) ui.log(`Deleted: ${status.deleted.join(', ')}`);
      if (status.not_added.length) ui.log(`Untracked: ${status.not_added.join(', ')}`);
      break;

    case 'commit':
      const commitDiff = await git.stagedDiff();
      if (!commitDiff && !(await git.status()).staged.length) {
        await git.addAll();
      }
      const result = await git.commit({ message: argsStr || 'Update' });
      if (result) {
        ui.success(`Committed: ${result.hash} ${result.message}`);
      } else {
        ui.error('Nothing to commit');
      }
      break;

    case 'undo':
      if (await git.undoLastCommit()) {
        ui.success('Undid last commit');
      } else {
        ui.error('Failed to undo');
      }
      break;

    case 'tokens':
      const tokens = await ctx.estimateTokenCount();
      ui.showTokens(tokens);
      break;

    case 'mcp':
      const subCmd = args[0];
      if (subCmd === 'status') {
        const statuses = mcpManager.getAllServerStatuses();
        for (const [name, status] of statuses) {
          ui.log(`${name}: ${status}`);
        }
      } else if (subCmd === 'tools') {
        const tools = mcpManager.getAllTools();
        for (const tool of tools) {
          ui.log(`${tool.name} (${tool.serverName}): ${tool.description}`);
        }
      } else {
        ui.log('Usage: /mcp [status|tools]');
      }
      break;

    case 'skill':
      if (argsStr) {
        const newSkill = setActiveSkill(argsStr);
        if (newSkill) {
          ctx.setSkill(newSkill);
          ui.success(`Switched to @${newSkill.name}`);
        } else {
          ui.error(`Unknown skill: ${argsStr}`);
        }
      } else {
        ui.note(
          listSkills().map(s => `@${s.name} - ${s.description}`).join('\n'),
          'Available Skills'
        );
      }
      break;

    case 'exit':
    case 'quit':
    case 'q':
      process.exit(0);

    default:
      ui.error(`Unknown command: /${cmd}`);
  }
}

/**
 * Load agent rules from AGENT.md
 */
function loadAgentRules(): string {
  const paths = ['./AGENT.md', './.agent.md', './.aider/agent.md'];
  for (const path of paths) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }
  return '';
}
