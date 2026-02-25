import { spawn } from 'child_process';
import { saveShowcaseRun, ShowcaseRun, ShowcaseStep } from '../src/mcp_servers/health_monitor/showcase_reporter.js';
import { join } from 'path';
import { readdirSync, existsSync } from 'fs';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

export async function runShowcase() {
    console.log("🚀 Starting Automated Showcase Validation...");

    const startTime = Date.now();
    const steps: ShowcaseStep[] = [];
    let success = false;
    let error: string | undefined;

    // Command: docker compose -f demos/simple-cli-showcase/docker-compose.yml run --rm agent npx tsx /app/demos/simple-cli-showcase/run_demo.ts
    const dockerArgs = [
        'compose',
        '-f', 'demos/simple-cli-showcase/docker-compose.yml',
        'run', '--rm',
        'agent',
        'npx', 'tsx', '/app/demos/simple-cli-showcase/run_demo.ts'
    ];

    console.log(`Executing: docker ${dockerArgs.join(' ')}`);

    const child = spawn('docker', dockerArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
        const str = data.toString();
        process.stdout.write(str);
        stdout += str;
        parseOutput(str, steps);
    });

    child.stderr.on('data', (data) => {
        const str = data.toString();
        process.stderr.write(str);
        stderr += str;
    });

    try {
        const exitCode = await new Promise<number>((resolve) => {
            child.on('close', resolve);
        });

        const duration = Date.now() - startTime;
        success = exitCode === 0;

        if (!success) {
            error = `Process exited with code ${exitCode}`;
            if (stderr) {
                 const lines = stderr.trim().split('\n');
                 if (lines.length > 0) error += `: ${lines[lines.length - 1]}`;
            }
        }

        if (stdout.includes("✅ Showcase Simulation Complete!")) {
             success = true;
        } else if (exitCode === 0) {
             // Fallback
        }

        const run: ShowcaseRun = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            success,
            total_duration_ms: duration,
            steps,
            artifact_count: countArtifacts(),
            error
        };

        console.log(`\n📊 Saving Showcase Run (Success: ${success})...`);
        await saveShowcaseRun(run);

        if (!success) {
            console.error("❌ Showcase Validation Failed.");
            process.exit(1);
        } else {
            console.log("✅ Showcase Validation Passed.");
            process.exit(0);
        }

    } catch (e: any) {
        // If this is a test-induced exit error, rethrow it
        if (e.message && e.message.includes("Process exit")) throw e;

        console.error("Fatal error running showcase:", e);
        process.exit(1);
    }
}

function parseOutput(chunk: string, steps: ShowcaseStep[]) {
    const lines = chunk.split('\n');
    for (const line of lines) {
        if (line.includes("--- Pillar 1: Company Context ---")) addStep(steps, "Pillar 1: Company Context");
        if (line.includes("--- Pillar 2: SOP-as-Code ---")) addStep(steps, "Pillar 2: SOP-as-Code");
        if (line.includes("--- Pillar 3: Ghost Mode (Time Lapse) ---")) addStep(steps, "Pillar 3: Ghost Mode");
        if (line.includes("--- Pillar 4: HR Loop (Self-Optimization) ---")) addStep(steps, "Pillar 4: HR Loop");
        if (line.includes("--- Pillar 5: Framework Integration (Roo Code) ---")) addStep(steps, "Pillar 5: Framework Integration");

        if (line.includes("Failed to") || line.includes("Error:") || line.includes("⚠️")) {
             markLastStepFailed(steps, line.trim());
        }
    }
}

function addStep(steps: ShowcaseStep[], name: string) {
    steps.push({ name, status: 'success', details: 'Started' });
}

function markLastStepFailed(steps: ShowcaseStep[], details: string) {
    if (steps.length > 0) {
        const last = steps[steps.length - 1];
        last.status = 'failure';
        last.details = details;
    }
}

function countArtifacts(): number {
    let count = 0;
    const dirs = [
        join(process.cwd(), '.agent', 'ghost_logs'),
        join(process.cwd(), '.agent', 'hr', 'proposals')
    ];

    for (const d of dirs) {
        if (existsSync(d)) {
            try {
                count += readdirSync(d).length;
            } catch {}
        }
    }
    return count;
}

runShowcase();
