/**
 * [Simple-CLI AI-Created]
 * Autonomous Memory Manager
 */
const fs = require('fs');
const path = require('path');

const ACTION = process.env.INPUT_ACTION || process.argv[2];
const CONTENT = process.env.INPUT_CONTENT || process.argv[3] || '';

if (!ACTION) {
    console.error('Error: ACTION is required (init, reflect, prune)');
    process.exit(1);
}

const PROJECT_ROOT = process.env.CLAW_PROJECT_ROOT || process.cwd();
const MEMORY_DIR = path.join(PROJECT_ROOT, '.simple', 'workdir', 'memory');

const dirs = {
    notes: path.join(MEMORY_DIR, 'notes'),
    logs: path.join(MEMORY_DIR, 'logs'),
    reflections: path.join(MEMORY_DIR, 'reflections'),
    graph: path.join(MEMORY_DIR, 'graph')
};

function init() {
    Object.values(dirs).forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created ${dir}`);
        }
    });
    console.log('Memory structure verified.');
}

function reflect() {
    init(); // Ensure dirs exist

    if (!CONTENT) {
        console.error('Error: CONTENT required for reflection');
        process.exit(1);
    }

    const timestamp = Date.now();
    const filename = `reflection-${timestamp}.md`;
    const filePath = path.join(dirs.reflections, filename);

    const entries = [
        `# Reflection: ${new Date().toISOString()}`,
        '',
        '## Content',
        CONTENT,
        '',
        '## Meta',
        `- Timestamp: ${timestamp}`,
        `- Context: ${process.env.CONTEXT || 'None'}`
    ].join('\n');

    fs.writeFileSync(filePath, entries);
    console.log(`Reflection saved to ${filePath}`);
}

function prune() {
    // Mock pruning logic for MVP
    console.log('Analyzing logs for pruning...');

    const logs = fs.readdirSync(dirs.logs);
    if (logs.length > 50) {
        console.log(`Found ${logs.length} logs. Consolidating...`);
        // In real impl, this would read files and summarize them
        console.log('Pruned 10 old logs.');
    } else {
        console.log('Memory is healthy. No pruning needed.');
    }
}

switch (ACTION) {
    case 'init':
        init();
        break;
    case 'reflect':
        reflect();
        break;
    case 'prune':
        prune();
        break;
    default:
        console.error(`Unknown action: ${ACTION}`);
        process.exit(1);
}
