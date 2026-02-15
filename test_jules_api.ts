#!/usr/bin/env npx tsx
/**
 * Test script for Jules API invocation
 */
import { execSync } from 'child_process';

const JULES_API_KEY = process.env.JULES_API_KEY;
const API_BASE = "https://jules.googleapis.com/v1alpha";

async function testJulesAPI() {
    console.log("Testing Jules API...");

    if (!JULES_API_KEY) {
        console.error("❌ JULES_API_KEY not set");
        console.log("Please set JULES_API_KEY environment variable");
        return;
    }

    console.log("✓ JULES_API_KEY is set");

    try {
        // Extract owner/repo from git remote
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        let owner = '', repo = '';

        if (remoteUrl.includes('github.com')) {
            const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
            if (match) {
                owner = match[1];
                repo = match[2];
            }
        }

        console.log(`\nRepository: ${owner}/${repo}`);

        // 1. Get PR details
        console.log("\n1. Fetching PR #171 details...");
        const prJson = execSync('gh pr view 171 --json headRefName,headRepository,author', { encoding: 'utf-8' });
        const prData = JSON.parse(prJson);
        console.log("PR Branch:", prData.headRefName);
        console.log("PR Author:", prData.author.login);

        // 2. List sources
        console.log("\n2. Listing Jules sources...");
        const sourcesRes = await fetch(`${API_BASE}/sources`, {
            headers: { "X-Goog-Api-Key": JULES_API_KEY }
        });

        if (!sourcesRes.ok) {
            const errorText = await sourcesRes.text();
            console.error("❌ Failed to list sources:", sourcesRes.status, errorText);
            return;
        }

        const sourcesData: any = await sourcesRes.json();
        console.log("Sources found:", sourcesData.sources?.length || 0);

        if (sourcesData.sources) {
            console.log("\nAvailable sources:");
            sourcesData.sources.forEach((s: any) => {
                console.log(`  - ${s.name}`);
                console.log(`    Repo: ${s.githubRepo?.owner}/${s.githubRepo?.repo}`);
            });
        }

        const source = sourcesData.sources?.find((s: any) =>
            s.githubRepo?.owner === owner && s.githubRepo?.repo === repo
        );

        if (!source) {
            console.error(`\n❌ Repository ${owner}/${repo} not found in Jules sources`);
            return;
        }

        console.log(`\n✓ Found matching source: ${source.name}`);
        console.log("\n✅ Jules API connection test successful!");

    } catch (error: any) {
        console.error("❌ Error:", error.message);
    }
}

testJulesAPI();
