import { intro, outro, spinner, log } from '@clack/prompts';
import pc from 'picocolors';
import { showBanner } from '../src/tui.js';

async function main() {
    // 1. Show Banner
    showBanner();

    // 2. Simulate user input (which would normally happen via `text()`)
    // We just log it for the preview
    // console.log(pc.gray('User: Create a React app named "my-app"'));

    // 3. Agent Thought
    log.info(pc.dim('Planning to use create-react-app to scaffold the project structure...'));

    // 4. Tool Execution (Spinner)
    const s = spinner();
    s.start('Executing run_command...');

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    s.stop('Executed run_command');

    // 5. Supervisor Check
    log.step('[Supervisor] Verifying work from run_command...');

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 800));

    log.success('[Supervisor] QA PASSED. Work verified.');

    // 6. Agent Response
    console.log();
    console.log(pc.blue('Agent:'));
    console.log('I have created the React app "my-app" successfully.');
    console.log();

    // 7. Outro
    outro('Session finished.');
}

main().catch(console.error);
