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

    // Check Phase 17 completion
    if (!content.includes('Phase 17: Autonomous Integration Pipeline (✅ Completed)')) {
        console.error('❌ Phase 17 is not marked as completed in ROADMAP.md');
        process.exit(1);
    } else {
        console.log('✅ Phase 17 is marked as completed');
    }

    // Check Phase 18 existence
    if (!content.includes('Phase 18: Ecosystem Expansion & Real-World Validation')) {
        console.error('❌ Phase 18 section is missing in ROADMAP.md');
        process.exit(1);
    } else {
        console.log('✅ Phase 18 section exists');
    }

    // Check Phase 18 details
    const phase18Details = [
        'Framework Blitz',
        'Deployment Playbooks',
        'Performance Benchmarking'
    ];

    phase18Details.forEach(detail => {
        if (!content.includes(detail)) {
            console.error(`❌ Phase 18 detail "${detail}" is missing in ROADMAP.md`);
            process.exit(1);
        }
    });
    console.log('✅ Phase 18 details verified');

    // Basic Link Validation
    const linkRegex = /\[.*?\]\((.*?)\)/g;
    let match;
    let brokenLinks = 0;

    while ((match = linkRegex.exec(content)) !== null) {
        const link = match[1];
        if (link.startsWith('http')) continue;
        if (link.startsWith('#')) continue; // anchors
        if (link.startsWith('mailto:')) continue;

        const linkPath = path.join(path.dirname(roadmapPath), link);
        if (!fs.existsSync(linkPath)) {
             console.warn(`⚠️  Potential broken link: ${link}`);
             brokenLinks++;
        }
    }

    if (brokenLinks > 0) {
        console.log(`⚠️  Found ${brokenLinks} potential broken links (non-fatal for this check).`);
    } else {
        console.log('✅ No broken local links found');
    }
}

function validateTodo() {
    console.log('\nValidating docs/todo.md...');
    const content = fs.readFileSync(todoPath, 'utf8');

    // Check Sprint 4 completion
    if (!content.includes('Sprint 4: Autonomous Pipeline (✅ Completed)')) {
        console.error('❌ Sprint 4 is not marked as completed in todo.md');
        process.exit(1);
    } else {
        console.log('✅ Sprint 4 is marked as completed');
    }

     // Check Phase 17 completion
     if (!content.includes('Phase 17: Autonomous Integration Pipeline (✅ Completed)')) {
        console.error('❌ Phase 17 is not marked as completed in todo.md');
        process.exit(1);
    } else {
        console.log('✅ Phase 17 is marked as completed');
    }


    // Check Sprint 5 existence
    if (!content.includes('Sprint 5: Ecosystem Expansion (Current)')) {
        console.error('❌ Sprint 5 section is missing in todo.md');
        process.exit(1);
    } else {
        console.log('✅ Sprint 5 section exists');
    }

    // Check Phase 18 existence
    if (!content.includes('Phase 18: Ecosystem Expansion & Real-World Validation')) {
        console.error('❌ Phase 18 section is missing in todo.md');
        process.exit(1);
    } else {
        console.log('✅ Phase 18 section exists');
    }
}

try {
    validateRoadmap();
    validateTodo();
    console.log('\n✅ All validations passed!');
} catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
}
