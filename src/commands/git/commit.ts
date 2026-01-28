import { Command, Flags } from '@oclif/core';
import * as ui from '../../lib/ui.js';
import { getGitManager, generateCommitMessage } from '../../lib/git.js';
import { createProvider } from '../../providers/index.js';
import 'dotenv/config';

export default class GitCommit extends Command {
  static description = 'Commit changes with optional AI-generated message';

  static flags = {
    message: Flags.string({
      char: 'm',
      description: 'Commit message',
    }),
    ai: Flags.boolean({
      description: 'Generate commit message using AI',
      default: false,
    }),
    all: Flags.boolean({
      char: 'a',
      description: 'Stage all changes',
      default: false,
    }),
  };

  static examples = [
    '<%= config.bin %> git commit -m "feat: add new feature"',
    '<%= config.bin %> git commit --ai',
    '<%= config.bin %> git commit -a --ai',
  ];

  async run(): Promise<void> {
    const { flags } = await this.parse(GitCommit);
    const git = getGitManager();

    if (!(await git.isRepo())) {
      ui.error('Not a git repository');
      return;
    }

    // Stage all if requested
    if (flags.all) {
      await git.addAll();
    }

    // Get diff
    const diff = await git.stagedDiff();
    if (!diff) {
      const status = await git.status();
      if (status.modified.length === 0 && status.created.length === 0) {
        ui.error('Nothing to commit');
        return;
      }
      // Auto-stage if no staged changes
      await git.addAll();
    }

    // Get or generate message
    let message = flags.message;

    if (!message && flags.ai) {
      const provider = createProvider();
      const currentDiff = await git.stagedDiff() || await git.diff();

      message = await ui.spin('Generating commit message...', async () => {
        return generateCommitMessage(currentDiff, async (prompt) => {
          return provider.generateResponse(prompt, []);
        });
      });

      ui.log(`Generated message: ${message}`);

      const confirmed = await ui.confirm({
        message: 'Use this message?',
        initialValue: true,
      });

      if (ui.isCancel(confirmed) || !confirmed) {
        const custom = await ui.text({
          message: 'Enter commit message:',
          placeholder: message,
        });

        if (ui.isCancel(custom)) {
          ui.cancel('Commit cancelled');
          return;
        }

        message = custom as string;
      }
    }

    if (!message) {
      const input = await ui.text({
        message: 'Enter commit message:',
        validate: (v) => (v.trim() ? undefined : 'Message required'),
      });

      if (ui.isCancel(input)) {
        ui.cancel('Commit cancelled');
        return;
      }

      message = input as string;
    }

    // Commit
    const result = await git.commit({ message });

    if (result) {
      ui.success(`Committed: ${result.hash} ${result.message}`);
    } else {
      ui.error('Commit failed');
    }
  }
}
