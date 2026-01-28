import { Command } from '@oclif/core';
import * as ui from '../../lib/ui.js';
import { getGitManager } from '../../lib/git.js';

export default class GitStatus extends Command {
  static description = 'Show git repository status';

  static examples = ['<%= config.bin %> git status'];

  async run(): Promise<void> {
    const git = getGitManager();

    if (!(await git.isRepo())) {
      ui.error('Not a git repository');
      return;
    }

    const status = await git.status();

    ui.log(`Branch: ${status.current || 'detached HEAD'}`);

    if (status.ahead > 0) {
      ui.log(`Ahead of origin by ${status.ahead} commit(s)`);
    }
    if (status.behind > 0) {
      ui.log(`Behind origin by ${status.behind} commit(s)`);
    }

    const changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];

    for (const file of status.created) {
      changes.push({ path: file, status: 'added' });
    }
    for (const file of status.modified) {
      changes.push({ path: file, status: 'modified' });
    }
    for (const file of status.deleted) {
      changes.push({ path: file, status: 'deleted' });
    }
    for (const file of status.not_added) {
      changes.push({ path: file, status: 'added' });
    }

    if (changes.length > 0) {
      ui.log('\nChanges:');
      ui.showFileStatus(changes);
    } else {
      ui.success('Working tree clean');
    }
  }
}
