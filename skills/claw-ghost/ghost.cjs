/**
 * [Simple-CLI AI-Created]
 * Ghost Mode Manager - Platform Agnostic Adapter Pattern
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ACTION = process.env.INPUT_ACTION || process.argv[2];
const INTENT = process.env.INPUT_INTENT || '';
const CRON = process.env.INPUT_CRON || '';
const ID = process.env.INPUT_ID || '';

const PROJECT_ROOT = process.env.CLAW_PROJECT_ROOT || process.cwd();
const GHOST_DB = path.join(PROJECT_ROOT, '.simple', 'workdir', 'ghosts.json');

// --- 1. Scheduler Adapter Interface ---

class SchedulerAdapter {
    schedule(id, cmd, cron) { throw new Error('Not implemented'); }
    remove(id) { throw new Error('Not implemented'); }
    list() { throw new Error('Not implemented'); }
}

// --- 2. Windows Implementation (schtasks) ---

class WindowsScheduler extends SchedulerAdapter {
    schedule(id, cmd, cron) {
        const cronParts = cron.split(' ');
        if (cronParts.length !== 5) throw new Error('Invalid cron format. Expected: min hour day month weekday');

        const [minute, hour, day, month, weekday] = cronParts;
        let scheduleType = '/SC ONCE';
        let modifier = '';

        // Minimalistic cron-to-schtasks mapping
        if (minute === '*' && hour === '*') {
            scheduleType = '/SC MINUTE';
            modifier = '/MO 1';
        } else if (hour === '*') {
            scheduleType = '/SC HOURLY';
        } else if (day === '*' && month === '*') {
            scheduleType = '/SC DAILY';
        }

        const startTime = `${hour === '*' ? '00' : hour.padStart(2, '0')}:${minute === '*' ? '00' : minute.padStart(2, '0')}`;
        // Note: Using 'cmd /c' to ensure we can run node commands
        const taskCmd = `cmd /c "${cmd.replace(/"/g, '\\"')}"`;
        const schtasksCmd = `schtasks /CREATE /TN "SimpleCLI_${id}" /TR "${taskCmd}" ${scheduleType} ${modifier} /ST ${startTime} /F`;

        execSync(schtasksCmd, { encoding: 'utf-8', stdio: 'inherit' });
        console.log(`✅ Created Windows task: SimpleCLI_${id}`);
    }

    remove(id) {
        try {
            execSync(`schtasks /DELETE /TN "SimpleCLI_${id}" /F`, { stdio: 'ignore' });
            console.log(`✅ Removed Windows task: SimpleCLI_${id}`);
        } catch (e) {
            console.warn(`⚠️  Task SimpleCLI_${id} not found in scheduler`);
        }
    }

    list() {
        return execSync('schtasks /query /fo LIST', { encoding: 'utf-8' });
    }
}

// --- 3. Unix Implementation (crontab) ---

class UnixScheduler extends SchedulerAdapter {
    schedule(id, cmd, cron) {
        let currentCrontab = '';
        try {
            currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
        } catch (e) { /* No crontab yet */ }

        const entry = `${cron} ${cmd} # SimpleCLI_${id}`;
        // Avoid duplicates
        if (currentCrontab.includes(`SimpleCLI_${id}`)) {
            console.log(`Task ${id} already exists in crontab.`);
            return;
        }

        const newCrontab = currentCrontab ? `${currentCrontab}\n${entry}` : entry;
        this.writeCrontab(newCrontab);
        console.log(`✅ Added to crontab: ${entry}`);
    }

    remove(id) {
        try {
            const currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
            const lines = currentCrontab.split('\n');
            const filtered = lines.filter(line => !line.includes(`SimpleCLI_${id}`));

            if (filtered.length < lines.length) {
                this.writeCrontab(filtered.join('\n'));
                console.log(`✅ Removed from crontab: SimpleCLI_${id}`);
            } else {
                console.warn(`⚠️  Task SimpleCLI_${id} not found in crontab`);
            }
        } catch (e) {
            console.warn(`⚠️  Could not update crontab: ${e.message}`);
        }
    }

    list() {
        try {
            return execSync('crontab -l', { encoding: 'utf-8' });
        } catch {
            return 'No crontab entries.';
        }
    }

    writeCrontab(content) {
        const tempFile = path.join(os.tmpdir(), `crontab_${Date.now()}.txt`);
        fs.writeFileSync(tempFile, content + '\n'); // Ensure trailing newline
        execSync(`crontab "${tempFile}"`, { encoding: 'utf-8' });
        fs.unlinkSync(tempFile);
    }
}

// --- 4. Factory & Logic ---

function getScheduler() {
    return os.platform() === 'win32' ? new WindowsScheduler() : new UnixScheduler();
}

// Ensure Ghost DB
if (!fs.existsSync(GHOST_DB)) {
    const dir = path.dirname(GHOST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GHOST_DB, JSON.stringify([], null, 2));
}

function loadGhosts() {
    return JSON.parse(fs.readFileSync(GHOST_DB, 'utf-8'));
}

function saveGhosts(ghosts) {
    fs.writeFileSync(GHOST_DB, JSON.stringify(ghosts, null, 2));
}

const scheduler = getScheduler();

function run() {
    switch (ACTION) {
        case 'schedule':
            if (!INTENT || !CRON) {
                console.error('Error: INTENT and CRON required for schedule');
                process.exit(1);
            }
            const id = `ghost-${Date.now().toString(36)}`;
            // Use 'simple' binary if global, or node call if local
            // For robustness, let's assume we run 'node cli.js' logic similar to how this script is invoked
            // A safer bet is to use the full path to the project's bin or current script context
            // But PRD says "simple -claw", implying 'simple' is in PATH or we use relative.
            const cmd = `simple -claw "${INTENT}" --ghost`;

            scheduler.schedule(id, cmd, CRON);

            const ghosts = loadGhosts();
            ghosts.push({ id, intent: INTENT, cron: CRON, command: cmd, created: new Date().toISOString() });
            saveGhosts(ghosts);
            break;

        case 'list':
            const allGhosts = loadGhosts();
            if (allGhosts.length === 0) {
                console.log('No registered ghost tasks in local DB.');
            } else {
                console.log('Active Ghost Tasks (DB):');
                allGhosts.forEach(g => console.log(`[${g.id}] "${g.intent}" @ "${g.cron}"`));
            }
            console.log('\n--- System Scheduler Output ---');
            console.log(scheduler.list());
            break;

        case 'kill':
            if (!ID) {
                console.error('Error: ID required for kill');
                process.exit(1);
            }
            let currentGhosts = loadGhosts();
            const toKill = ID === 'all' ? currentGhosts : currentGhosts.filter(g => g.id === ID);

            toKill.forEach(g => scheduler.remove(g.id));

            currentGhosts = currentGhosts.filter(g => !toKill.includes(g));
            saveGhosts(currentGhosts);
            break;

        default:
            console.error(`Unknown action: ${ACTION}`);
            process.exit(1);
    }
}

run();
