#!/usr/bin/env npx tsx
/**
 * Test Jules API task creation for PR #171
 */
import { execSync } from 'child_process';

const JULES_API_KEY = process.env.JULES_API_KEY;
const API_BASE = "https://jules.googleapis.com/v1alpha";

function run(cmd: string) {
    return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
}

async function testJulesTaskCreation() {
    console.log("Testing Jules task creation for PR #171...\n");

    if (!JULES_API_KEY) {
        console.error("❌ JULES_API_KEY not set");
        console.log("Please set JULES_API_KEY environment variable");
        return;
    }

    console.log("✓ JULES_API_KEY is set");

    try {
        // Get PR details
        const prNumber = 171;
        const prJson = run(`gh pr view ${prNumber} --json headRefName,headRepositoryOwner,headRepository`);
        const prData = JSON.parse(prJson);
        const branch = prData.headRefName;
        const owner = prData.headRepositoryOwner?.login || 'stancsz';
        const repo = prData.headRepository?.name || 'simple-cli';

        console.log(`\nPR #${prNumber}:`);
        console.log(`  Repository: ${owner}/${repo}`);
        console.log(`  Branch: ${branch}`);

        // List sources
        console.log("\nFetching Jules sources...");
        const sourcesRes = await fetch(`${API_BASE}/sources`, {
            headers: { "X-Goog-Api-Key": JULES_API_KEY }
        });

        if (!sourcesRes.ok) {
            const errorText = await sourcesRes.text();
            console.error("❌ Failed to list sources:", sourcesRes.status, errorText);
            return;
        }

        const sourcesData: any = await sourcesRes.json();
        console.log(`Found ${sourcesData.sources?.length || 0} Jules sources`);

        // Find matching source
        const source = sourcesData.sources?.find((s: any) =>
            s.githubRepo?.owner === owner && s.githubRepo?.repo === repo
        );

        if (!source) {
            console.error(`\n❌ Repository ${owner}/${repo} not found in Jules sources`);
            console.log("\nAvailable sources:");
            sourcesData.sources?.forEach((s: any) => {
                console.log(`  - ${s.githubRepo?.owner}/${s.githubRepo?.repo}`);
            });
            return;
        }

        console.log(`✓ Found matching source: ${source.name}`);

        // Create session
        const task = `Test task for PR #${prNumber}: Please analyze the merge conflicts in this PR and provide a summary of what needs to be fixed.`;

        console.log(`\nCreating Jules session...`);
        console.log(`Task: ${task}`);

        const sessionBody = {
            prompt: task,
            sourceContext: {
                source: source.name,
                githubRepoContext: {
                    startingBranch: branch,
                },
            },
            automationMode: "AUTO_CREATE_PR",
            title: `Test: Fix PR #${prNumber}`,
        };

        const sessionRes = await fetch(`${API_BASE}/sessions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": JULES_API_KEY,
            },
            body: JSON.stringify(sessionBody),
        });

        if (!sessionRes.ok) {
            const errorText = await sessionRes.text();
            console.error(`\n❌ Failed to create session (${sessionRes.status}):`, errorText);
            return;
        }

        const session = await sessionRes.json();
        console.log(`\n✅ Jules session created successfully!`);
        console.log(`Session ID: ${session.name}`);

        // Extract session ID for URL
        const sessionId = session.name.split('/').pop();
        console.log(`\nView session at: https://jules.google.com/session/${sessionId}`);

    } catch (error: any) {
        console.error("\n❌ Error:", error.message);
        console.error(error.stack);
    }
}

testJulesTaskCreation();
