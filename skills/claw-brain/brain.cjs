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
    const MAX_LOGS = 50;
    const MAX_LOG_AGE_DAYS = 7;

    console.log('🧹 Analyzing memory for pruning...');

    // Check logs directory
    if (!fs.existsSync(dirs.logs)) {
        console.log('No logs directory found. Nothing to prune.');
        return;
    }

    const logFiles = fs.readdirSync(dirs.logs)
        .filter(f => f.endsWith('.log'))
        .map(f => ({
            name: f,
            path: path.join(dirs.logs, f),
            stats: fs.statSync(path.join(dirs.logs, f))
        }))
        .sort((a, b) => a.stats.mtime - b.stats.mtime); // oldest first

    console.log(`Found ${logFiles.length} log files.`);

    if (logFiles.length <= MAX_LOGS) {
        console.log('✅ Memory is healthy. No pruning needed.');
        return;
    }

    // Consolidate old logs
    const toConsolidate = logFiles.slice(0, logFiles.length - MAX_LOGS);
    const toKeep = logFiles.slice(logFiles.length - MAX_LOGS);

    console.log(`Consolidating ${toConsolidate.length} old logs...`);

    // Read and combine old logs into a summary
    const summaryLines = ['# Archived Logs', '', `Consolidated ${toConsolidate.length} logs on ${new Date().toISOString()}`, ''];

    toConsolidate.forEach(file => {
        try {
            const content = fs.readFileSync(file.path, 'utf-8');
            summaryLines.push(`## ${file.name} (${file.stats.mtime.toISOString()})`);
            summaryLines.push(content.split('\n').slice(0, 10).join('\n')); // First 10 lines
            summaryLines.push('...(truncated)', '');
        } catch (e) {
            summaryLines.push(`## ${file.name} - Error reading: ${e.message}`, '');
        }
    });

    // Write summary to notes
    const summaryFile = path.join(dirs.notes, `archive-${Date.now()}.md`);
    fs.writeFileSync(summaryFile, summaryLines.join('\n'));
    console.log(`📝 Created archive summary: ${summaryFile}`);

    // Delete old log files
    toConsolidate.forEach(file => {
        try {
            fs.unlinkSync(file.path);
        } catch (e) {
            console.warn(`⚠️  Could not delete ${file.name}: ${e.message}`);
        }
    });

    console.log(`✅ Pruned ${toConsolidate.length} logs. Kept ${toKeep.length} recent logs.`);

    // Also prune old reflections (keep last 20)
    pruneReflections();
}

function pruneReflections() {
    if (!fs.existsSync(dirs.reflections)) return;

    const reflections = fs.readdirSync(dirs.reflections)
        .filter(f => f.startsWith('reflection-'))
        .map(f => ({
            name: f,
            path: path.join(dirs.reflections, f),
            stats: fs.statSync(path.join(dirs.reflections, f))
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime); // newest first

    if (reflections.length > 20) {
        const toDelete = reflections.slice(20);
        toDelete.forEach(file => {
            try {
                fs.unlinkSync(file.path);
            } catch (e) {
                // ignore
            }
        });
        console.log(`🗑️  Pruned ${toDelete.length} old reflections.`);
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
