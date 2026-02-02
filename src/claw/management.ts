import { execSync } from 'child_process';
import { platform } from 'os';
import pc from 'picocolors';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function listClawAssets() {
    console.log(pc.cyan('\n🔍 Claw Mode Assets & Ghost Tasks:\n'));

    // 1. List Skills
    console.log(pc.yellow('🛠️  Available Skills:'));
    const { getMeta } = await import('../registry.js').catch(() => ({ getMeta: null }));

    async function printSkill(path: string, type: string) {
        try {
            const files = await readdir(path);
            for (const f of files) {
                if (f.endsWith('.md') || f.endsWith('.ts') || f.endsWith('.js')) {
                    const content = await readFile(join(path, f), 'utf-8');
                    const meta = (getMeta as any)?.(content, f);
                    if (meta) {
                        console.log(pc.green(`  - ${meta.name} `) + pc.dim(`(${f}, ${type}): ${meta.description || ''}`));
                    } else {
                        console.log(pc.dim(`  - ${f} (${type})`));
                    }
                }
            }
        } catch (e) { }
    }

    await printSkill('skills', 'local');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    await printSkill(join(home, '.openclaw', 'workspace', 'skills'), 'global');

    // 2. List Ghost Tasks
    console.log(pc.yellow('\n👻 Active Ghost Tasks (Scheduled):'));
    const isWindows = platform() === 'win32';
    try {
        if (isWindows) {
            const tasks = execSync('schtasks /query /fo LIST', { encoding: 'utf-8' });
            const simpleTasks = tasks.split('\n\n').filter(t => t.includes('simple -claw'));
            if (simpleTasks.length === 0) console.log(pc.dim('  None found.'));
            else {
                simpleTasks.forEach(t => {
                    const name = t.match(/TaskName:\s+(.+)/)?.[1];
                    const nextRun = t.match(/Next Run Time:\s+(.+)/)?.[1];
                    if (name) console.log(pc.green(`  - ${name.trim()} `) + pc.dim(`(Next: ${nextRun})`));
                });
            }
        } else {
            let cron = '';
            try { cron = execSync('crontab -l', { encoding: 'utf-8' }); } catch (e) { /* ignore empty crontab */ }
            const simpleCron = cron.split('\n').filter(l => l.includes('simple -claw'));
            if (simpleCron.length === 0) console.log(pc.dim('  None found.'));
            else simpleCron.forEach(l => console.log(pc.green(`  - ${l}`)));
        }
    } catch (e) {
        console.log(pc.dim('  Error querying scheduler.'));
    }
}

export async function showGhostLogs(id?: string) {
    const logDir = '.simple/workdir/memory/logs';
    console.log(pc.cyan(`\n📜 Ghost Logs (${id || 'latest'}):\n`));
    try {
        const files = await readdir(logDir);
        const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();

        if (logFiles.length === 0) {
            console.log(pc.dim('  No logs found.'));
            return;
        }

        const fileToRead = id ? logFiles.find(f => f.includes(id)) : logFiles[0];
        if (!fileToRead) {
            console.log(pc.red(`  No log matching "${id}" found.`));
            return;
        }

        const content = await readFile(join(logDir, fileToRead), 'utf-8');
        console.log(pc.dim(`-- ${fileToRead} --`));
        console.log(content);
    } catch (e) {
        console.log(pc.red('  Error reading logs. Ensure you are in a Simple-CLI workspace.'));
    }
}

export async function killGhostTask(id: string) {
    const isWindows = platform() === 'win32';
    console.log(pc.cyan(`\n🛑 Terminating Ghost Task: ${id}...`));
    try {
        if (isWindows) {
            execSync(`schtasks /delete /tn "${id}" /f`);
        } else {
            const cron = execSync('crontab -l').toString();
            const newCron = cron.split('\n').filter(l => !l.includes(id)).join('\n');
            execSync(`echo "${newCron}" | crontab -`);
        }
        console.log(pc.green(`✅ Task "${id}" removed.`));
    } catch (e) {
        console.log(pc.red(`❌ Failed to kill task "${id}".`));
    }
}
