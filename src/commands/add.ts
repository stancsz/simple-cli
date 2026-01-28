import { Command, Args } from '@oclif/core';
import * as ui from '../lib/ui.js';
import { getContextManager } from '../context.js';
import { resolve } from 'path';
import { existsSync } from 'fs';

export default class Add extends Command {
  static description = 'Add files to the chat context';

  static args = {
    files: Args.string({
      description: 'Files to add (supports glob patterns)',
      required: true,
    }),
  };

  static examples = [
    '<%= config.bin %> add src/index.ts',
    '<%= config.bin %> add "src/**/*.ts"',
    '<%= config.bin %> add package.json tsconfig.json',
  ];

  async run(): Promise<void> {
    const { args, argv } = await this.parse(Add);
    const ctx = getContextManager();

    // Handle multiple files from argv
    const files = argv as string[];

    let added = 0;
    for (const file of files) {
      const fullPath = resolve(process.cwd(), file);

      if (file.includes('*')) {
        // Handle glob pattern
        const { execute } = await import('../tools/glob.js');
        const result = await execute({ pattern: file, cwd: process.cwd(), maxResults: 1000, includeDirectories: false });

        for (const match of result.matches) {
          if (ctx.addFile(match)) {
            ui.success(`Added ${match}`);
            added++;
          }
        }
      } else if (existsSync(fullPath)) {
        if (ctx.addFile(file)) {
          ui.success(`Added ${file}`);
          added++;
        }
      } else {
        ui.error(`File not found: ${file}`);
      }
    }

    ui.log(`Added ${added} file(s) to context`);
  }
}
