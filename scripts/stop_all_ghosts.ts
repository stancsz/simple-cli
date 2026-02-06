
import { execSync } from 'child_process';
import { platform } from 'os';
import pc from 'picocolors';

async function stopAllGhosts() {
    const isWindows = platform() === 'win32';
    console.log(pc.cyan('🛑 Stopping all background ghost tasks...'));

    try {
        if (isWindows) {
            // 1. Kill running node processes with Simple-CLI
            console.log(pc.yellow('Terminating active processes...'));
            try {
                // Use PowerShell to find and kill
                const psCmd = 'Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" | Where-Object { $_.CommandLine -match "dist/cli.js" -or $_.CommandLine -match "simple" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }';
                execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
            } catch (e) {
                console.log(pc.dim('No matching processes found or error terminating.'));
            }

            // 2. Clear schtasks
            console.log(pc.yellow('Cleaning up scheduled tasks (schtasks)...'));
            try {
                const tasksOutput = execSync('schtasks /query /fo CSV /v', { encoding: 'utf-8' });
                const lines = tasksOutput.split('\n');
                for (const line of lines) {
                    if (line.includes('simple -claw') || line.includes('ghost-')) {
                        const parts = line.split(',');
                        if (parts.length > 0) {
                            const taskName = parts[0].replace(/"/g, '');
                            if (taskName) {
                                console.log(pc.dim(`Deleting task: ${taskName}`));
                                execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: 'inherit' });
                            }
                        }
                    }
                }
            } catch (e) {
                console.log(pc.dim('No scheduled tasks found to remove.'));
            }
        } else {
            // Linux/Mac
            console.log(pc.yellow('Terminating active processes...'));
            try {
                execSync('pkill -f "dist/cli.js.*--ghost" || true');
                execSync('pkill -f "simple.*-claw" || true');
            } catch (e) {}

            console.log(pc.yellow('Cleaning up crontab...'));
            try {
                const cron = execSync('crontab -l', { encoding: 'utf-8' }).catch(() => '');
                if (cron) {
                    const lines = cron.split('\n');
                    const filtered = lines.filter(l => !l.includes('simple -claw') && !l.includes('--ghost'));
                    if (lines.length !== filtered.length) {
                        execSync(`echo "${filtered.join('\n')}" | crontab -`);
                        console.log(pc.green('Crontab cleaned.'));
                    }
                }
            } catch (e) {}
        }
        console.log(pc.green('\n✅ All background ghost tasks stopped and cleaned.'));
    } catch (error: any) {
        console.error(pc.red('❌ Error during cleanup:'), error.message);
    }
}

stopAllGhosts();
