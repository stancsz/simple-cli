/**
 * [Simple-CLI AI-Created]
 * Ghost Mode Manager (Cross-platform stub)
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

// Ensure DB exists
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

function schedule() {
    if (!INTENT || !CRON) {
        console.error('Error: INTENT and CRON required for schedule');
        process.exit(1);
    }

    const id = `ghost-${Date.now().toString(36)}`;
    const cmd = `simple -claw "${INTENT}" --ghost`;

    const ghost = {
        id,
        intent: INTENT,
        cron: CRON,
        command: cmd,
        created: new Date().toISOString()
    };

    const ghosts = loadGhosts();
    ghosts.push(ghost);
    saveGhosts(ghosts);

    console.log(`Scheduled Ghost Task [${id}]`);
    console.log(`- Intent: ${INTENT}`);
    console.log(`- Schedule: ${CRON}`);

    // Real OS scheduler integration
    if (os.platform() === 'win32') {
        scheduleWindows(id, cmd, CRON);
    } else {
        scheduleUnix(id, cmd, CRON);
    }
}

function scheduleWindows(id, cmd, cron) {
    // Convert cron to Windows Task Scheduler format
    const cronParts = cron.split(' ');
    if (cronParts.length !== 5) {
        console.error('Invalid cron format. Expected: min hour day month weekday');
        return;
    }

    const [minute, hour, day, month, weekday] = cronParts;

    // Build schtasks command
    let scheduleType = '/SC ONCE';
    let modifier = '';

    if (minute === '*' && hour === '*') {
        scheduleType = '/SC MINUTE';
        modifier = '/MO 1';
    } else if (hour === '*') {
        scheduleType = '/SC HOURLY';
    } else if (day === '*' && month === '*') {
        scheduleType = '/SC DAILY';
    }

    const startTime = `${hour === '*' ? '00' : hour.padStart(2, '0')}:${minute === '*' ? '00' : minute.padStart(2, '0')}`;

    const schtasksCmd = `schtasks /CREATE /TN "SimpleCLI_${id}" /TR "${cmd}" ${scheduleType} ${modifier} /ST ${startTime} /F`;

    try {
        execSync(schtasksCmd, { encoding: 'utf-8', stdio: 'inherit' });
        console.log(`✅ Created Windows task: SimpleCLI_${id}`);
    } catch (error) {
        console.error('Failed to create Windows task:', error.message);
    }
}

function scheduleUnix(id, cmd, cron) {
    try {
        // Get current crontab
        let currentCrontab = '';
        try {
            currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
        } catch (e) {
            // No crontab exists yet
        }

        // Add new entry with ID comment
        const entry = `${cron} ${cmd} # SimpleCLI_${id}`;
        const newCrontab = currentCrontab ? `${currentCrontab}\n${entry}` : entry;

        // Write back to crontab
        const tempFile = path.join(os.tmpdir(), `crontab_${id}.txt`);
        fs.writeFileSync(tempFile, newCrontab);
        execSync(`crontab ${tempFile}`, { encoding: 'utf-8' });
        fs.unlinkSync(tempFile);

        console.log(`✅ Added to crontab: ${entry}`);
    } catch (error) {
        console.error('Failed to update crontab:', error.message);
    }
}

function list() {
    const ghosts = loadGhosts();
    if (ghosts.length === 0) {
        console.log('No active ghost tasks.');
        return;
    }

    console.log('Active Ghost Tasks:');
    ghosts.forEach(g => {
        console.log(`[${g.id}] "${g.intent}" @ "${g.cron}"`);
    });
}

function kill() {
    if (!ID) {
        console.error('Error: ID required for kill');
        process.exit(1);
    }

    let ghosts = loadGhosts();
    const toKill = ID === 'all' ? ghosts : ghosts.filter(g => g.id === ID);

    if (toKill.length === 0 && ID !== 'all') {
        console.error(`Ghost ID ${ID} not found.`);
        process.exit(1);
    }

    // Remove from OS scheduler
    toKill.forEach(ghost => {
        if (os.platform() === 'win32') {
            try {
                execSync(`schtasks /DELETE /TN "SimpleCLI_${ghost.id}" /F`, { stdio: 'ignore' });
                console.log(`✅ Removed Windows task: SimpleCLI_${ghost.id}`);
            } catch (e) {
                console.warn(`⚠️  Task SimpleCLI_${ghost.id} not found in scheduler`);
            }
        } else {
            try {
                const currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
                const lines = currentCrontab.split('\n');
                const filtered = lines.filter(line => !line.includes(`SimpleCLI_${ghost.id}`));

                if (filtered.length < lines.length) {
                    const tempFile = path.join(os.tmpdir(), `crontab_cleanup_${Date.now()}.txt`);
                    fs.writeFileSync(tempFile, filtered.join('\n'));
                    execSync(`crontab ${tempFile}`, { encoding: 'utf-8' });
                    fs.unlinkSync(tempFile);
                    console.log(`✅ Removed from crontab: SimpleCLI_${ghost.id}`);
                }
            } catch (e) {
                console.warn(`⚠️  Could not update crontab: ${e.message}`);
            }
        }
    });

    // Update DB
    ghosts = ghosts.filter(g => !toKill.includes(g));
    saveGhosts(ghosts);
    console.log(`Terminated ${toKill.length} ghost task(s)`);
}

switch (ACTION) {
    case 'schedule':
        schedule();
        break;
    case 'list':
        list();
        break;
    case 'kill':
        kill();
        break;
    default:
        console.error(`Unknown action: ${ACTION}`);
        process.exit(1);
}
