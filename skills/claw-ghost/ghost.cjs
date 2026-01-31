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

    // NOTE: In a real implementation, we would write to crontab or use Windows Task Scheduler.
    // For this reference implementation, we just mock the DB entry.

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

    // Windows-specific note: Real implementation would use 'schtasks'
    if (os.platform() === 'win32') {
        console.log('(Mock): Would run: schtasks /create ...');
    } else {
        console.log('(Mock): Would update crontab ...');
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
    const initialLen = ghosts.length;
    ghosts = ghosts.filter(g => g.id !== ID && g.id !== 'all');

    if (ghosts.length < initialLen || ID === 'all') {
        saveGhosts(ghosts);
        console.log(`Terminated ghost task(s): ${ID}`);
    } else {
        console.error(`Ghost ID ${ID} not found.`);
        process.exit(1);
    }
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
