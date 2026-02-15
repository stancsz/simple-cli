#!/usr/bin/env npx tsx
/**
 * List all Jules sources with full details
 */

const JULES_API_KEY = process.env.JULES_API_KEY;
const API_BASE = "https://jules.googleapis.com/v1alpha";

async function listSources() {
    console.log("Fetching all Jules sources with details...\n");

    if (!JULES_API_KEY) {
        console.error("❌ JULES_API_KEY not set");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/sources`, {
            headers: { "x-goog-api-key": JULES_API_KEY }
        });

        if (!res.ok) {
            const error = await res.text();
            console.error(`❌ Failed (${res.status}):`, error);
            return;
        }

        const data: any = await res.json();
        console.log(`Found ${data.sources?.length || 0} sources\n`);

        if (data.sources) {
            data.sources.forEach((s: any, i: number) => {
                console.log(`${i + 1}. ${s.name}`);
                console.log(`   Display Name: ${s.displayName || 'N/A'}`);
                console.log(`   GitHub: ${s.githubRepo?.owner}/${s.githubRepo?.repo}`);
                console.log(`   URL: ${s.githubRepo?.url || 'N/A'}`);
                console.log();
            });

            // Search for simple-cli
            console.log("\nSearching for 'simple-cli'...");
            const matches = data.sources.filter((s: any) =>
                s.githubRepo?.repo?.toLowerCase().includes('simple') ||
                s.displayName?.toLowerCase().includes('simple')
            );

            if (matches.length > 0) {
                console.log(`Found ${matches.length} match(es):`);
                matches.forEach((s: any) => {
                    console.log(`  - ${s.githubRepo?.owner}/${s.githubRepo?.repo}`);
                    console.log(`    Source name: ${s.name}`);
                });
            } else {
                console.log("No matches found for 'simple-cli'");
            }
        }

    } catch (error: any) {
        console.error("❌ Error:", error.message);
    }
}

listSources();
