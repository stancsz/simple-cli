import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const roadmapPath = path.join(__dirname, '../docs/ROADMAP.md');
const todoPath = path.join(__dirname, '../docs/todo.md');

function validateRoadmap() {
    console.log('Validating docs/ROADMAP.md...');
    const content = fs.readFileSync(roadmapPath, 'utf8');

    // Check Last Updated date
    const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const lastUpdatedRegex = /Last Updated:\s*(.*)/;
    const lastUpdatedMatch = content.match(lastUpdatedRegex);

    if (lastUpdatedMatch) {
        console.log(`✅ Last Updated found: ${lastUpdatedMatch[1]}`);
    } else {
        console.error('❌ "Last Updated" field missing or incorrect format.');
        process.exit(1);
    }

    // Check Phase 22 Status
    const phase22Regex = /## Phase 22: Autonomous Client Lifecycle[\s\S]*?\*Status: Completed\*/;
    if (!phase22Regex.test(content)) {
        console.error('❌ Phase 22 status is not "Completed".');
        process.exit(1);
    } else {
        console.log('✅ Phase 22 status is "Completed".');
    }

    // Check Phase 22 Current Focus
    if (!content.includes('*Current Focus: Full Lifecycle Automation & Scaling*')) {
        console.error('❌ Phase 22 Current Focus is incorrect.');
        process.exit(1);
    } else {
        console.log('✅ Phase 22 Current Focus is correct.');
    }

    // Check Phase 23 Existence
    const phase23Header = '## Phase 23: Autonomous Agency Governance & Meta-Orchestration';
    if (!content.includes(phase23Header)) {
        console.error('❌ Phase 23 header missing.');
        process.exit(1);
    } else {
        console.log('✅ Phase 23 header exists.');
    }

    // Check Phase 23 Status
    const phase23Status = /## Phase 23: Autonomous Agency Governance & Meta-Orchestration[\s\S]*?\*Status: Proposed\*/;
    if (!phase23Status.test(content)) {
        console.error('❌ Phase 23 status is not "Proposed".');
        process.exit(1);
    } else {
        console.log('✅ Phase 23 status is "Proposed".');
    }

    // Check Phase 23 Sub-items
    const requiredSubItems = [
        'Swarm Fleet Management',
        'Predictive Client Health',
        'HR Loop & Dreaming Enhancement',
        'Agency Dashboard'
    ];

    requiredSubItems.forEach(item => {
        if (!content.includes(item)) {
            console.error(`❌ Phase 23 sub-item "${item}" is missing.`);
            process.exit(1);
        }
    });
    console.log('✅ All Phase 23 sub-items found.');
}

function validateTodo() {
    console.log('\nValidating docs/todo.md...');
    const content = fs.readFileSync(todoPath, 'utf8');

    // Check Phase 23 Placeholder
    if (!content.includes('## Phase 23')) {
        console.error('❌ Phase 23 placeholder missing in todo.md.');
        process.exit(1);
    }

    // Check Link to Roadmap
    if (!content.includes('(See [Roadmap](ROADMAP.md))') && !content.includes('(See [Roadmap](./ROADMAP.md))')) {
         if (!content.toLowerCase().includes('roadmap')) {
             console.warn('⚠️  Phase 23 in todo.md might be missing a link to the roadmap.');
         }
    }

    console.log('✅ Phase 23 placeholder found in todo.md.');
}

try {
    validateRoadmap();
    validateTodo();
    console.log('\n✅ All roadmap validations passed!');
} catch (error) {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
}
