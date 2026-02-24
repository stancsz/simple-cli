import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function updateDashboard() {
    console.log("Updating Benchmark Dashboard Data...");

    const resultsPath = join(process.cwd(), 'benchmarks', 'results.json');
    const dashboardPath = join(process.cwd(), 'docs', 'assets', 'benchmarks.json');

    // 1. Read latest benchmark results
    let latestResults;
    try {
        const content = await readFile(resultsPath, 'utf-8');
        latestResults = JSON.parse(content);
    } catch (e) {
        console.error("Failed to read latest benchmark results:", e);
        process.exit(1);
    }

    // 2. Read existing dashboard data
    let dashboardData: any[] = [];
    try {
        const content = await readFile(dashboardPath, 'utf-8');
        dashboardData = JSON.parse(content);
        if (!Array.isArray(dashboardData)) dashboardData = [];
    } catch (e) {
        console.log("Creating new dashboard data file.");
        dashboardData = [];
    }

    // 3. Append new entry
    const existingIndex = dashboardData.findIndex((d: any) => d.timestamp === latestResults.timestamp);
    if (existingIndex !== -1) {
        dashboardData[existingIndex] = latestResults;
    } else {
        dashboardData.push(latestResults);
    }

    // Limit history to last 50 runs
    if (dashboardData.length > 50) {
        dashboardData = dashboardData.slice(-50);
    }

    // 4. Save
    await mkdir(join(process.cwd(), 'docs', 'assets'), { recursive: true });
    await writeFile(dashboardPath, JSON.stringify(dashboardData, null, 2));

    console.log(`Dashboard data updated at ${dashboardPath}`);
}

updateDashboard().catch(console.error);
