
import { execute, name } from '../src/tools/fileOps.js';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import pc from 'picocolors';

const TEST_DIR = join(process.cwd(), 'test_move_playground');

async function testMove() {
    console.log(pc.cyan(`🧪 Testing tool: ${name}`));

    // Setup
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR);
    mkdirSync(join(TEST_DIR, 'dest'));

    const srcFile = join(TEST_DIR, 'test.txt');
    const destFile = join(TEST_DIR, 'dest', 'moved.txt');

    writeFileSync(srcFile, 'Hello World');
    console.log(pc.dim('📄 Created source file.'));

    try {
        const result = await execute({
            source: srcFile,
            destination: destFile,
            overwrite: false
        });

        console.log(pc.green('✔ Tool execution result:'), result);

        if (existsSync(destFile) && !existsSync(srcFile)) {
            console.log(pc.green('✅ Verification PASS: File moved successfully.'));
        } else {
            console.error(pc.red('❌ Verification FAIL: Files not in expected state.'));
            process.exit(1);
        }

    } catch (error) {
        console.error(pc.red('❌ Tool execution failed:'), error);
        process.exit(1);
    } finally {
        // Cleanup
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

testMove();
