import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeArchitecture } from '../../src/mcp_servers/health_monitor/architectural_metrics.js';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe('Phase 29: Architectural Health Monitor Validation', () => {

    const DUMMY_FILE_PATH = join(process.cwd(), 'src', 'dummy_complex_file.ts');

    beforeAll(() => {
        // Create an intentionally complex file to test analysis
        const complexContent = `
export function highlyComplexFunction(a: number, b: number) {
    let result = 0;
    if (a > 0) {
        for (let i = 0; i < a; i++) {
            if (i % 2 === 0) {
                result += b;
            } else if (i % 3 === 0) {
                result -= b;
            } else {
                result += 1;
            }
        }
    } else {
        while (b > 0) {
            result++;
            b--;
            if (b === 5) break;
        }
    }
    return result > 100 ? 100 : result;
}
        `;
        writeFileSync(DUMMY_FILE_PATH, complexContent, 'utf-8');
    });

    afterAll(() => {
        // Cleanup dummy file
        try {
            unlinkSync(DUMMY_FILE_PATH);
        } catch (e) {}
    });

    it('should correctly calculate cyclomatic complexity and analyze the codebase', async () => {
        const report = await analyzeArchitecture('src');

        expect(report.totalFiles).toBeGreaterThan(0);
        expect(report.totalLinesOfCode).toBeGreaterThan(0);
        expect(report.averageComplexity).toBeGreaterThan(0);
        expect(report.topRefactoringCandidates.length).toBeLessThanOrEqual(10);

        // Find our dummy file in the metrics
        const dummyFileMetric = report.metrics.find(m => m.filePath === '/src/dummy_complex_file.ts');
        expect(dummyFileMetric).toBeDefined();

        expect(dummyFileMetric!.cyclomaticComplexity).toBeGreaterThan(5);
        expect(dummyFileMetric!.linesOfCode).toBeGreaterThan(15);
    });

    it('should successfully call the analyze_architecture MCP tool, log metrics, and update dashboard', async () => {
        // 1. Call MCP tool
        const client = new Client({ name: "test-client", version: "1.0" }, { capabilities: {} });
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", "src/mcp_servers/health_monitor/index.ts"]
        });

        await client.connect(transport);

        const result: any = await client.callTool({
            name: "analyze_architecture",
            arguments: {}
        });

        await client.close();

        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.isError).toBeUndefined(); // Ensure no error

        const contentStr = result.content[0].text;
        const report = JSON.parse(contentStr);

        expect(report.totalFiles).toBeGreaterThan(0);
        expect(report.totalLinesOfCode).toBeGreaterThan(0);

        const dummyFileMetric = report.metrics.find((m: any) => m.filePath === '/src/dummy_complex_file.ts');
        expect(dummyFileMetric).toBeDefined();

        // 2. Validate metrics are stored in Brain (episodic memory via metrics files)
        const date = new Date().toISOString().split('T')[0];
        const filename = join(process.cwd(), '.agent', 'metrics', `${date}.ndjson`);

        const { existsSync, readFileSync } = await import('fs');
        expect(existsSync(filename)).toBe(true);

        const content = readFileSync(filename, 'utf-8');
        expect(content).toContain('architecture_total_files');
        expect(content).toContain('architecture_avg_complexity');
        expect(content).toContain('architecture_total_loc');

        // 3. Start Health Monitor server on port 3004 and hit the endpoint
        const { spawn } = await import('child_process');
        const hmProcess = spawn('npx', ['tsx', 'src/mcp_servers/health_monitor/index.ts'], {
            stdio: 'pipe',
            env: { ...process.env, PORT: '3004' }
        });

        let hmStarted = false;
        hmProcess.stderr?.on('data', (d) => {
            if (d.toString().includes('running on http')) hmStarted = true;
        });

        hmProcess.stdout?.on('data', (d) => {
            if (d.toString().includes('running on http')) hmStarted = true;
        });

        // Wait for server to start
        for (let i = 0; i < 100; i++) {
            if (hmStarted) break;
            await new Promise(r => setTimeout(r, 100));
        }

        try {
            const res = await fetch('http://localhost:3004/api/dashboard/architecture');
            expect(res.ok).toBe(true);
            const apiReport: any = await res.json();

            expect(apiReport.totalFiles).toBe(report.totalFiles);
            expect(apiReport.totalLinesOfCode).toBe(report.totalLinesOfCode);
            expect(apiReport.topRefactoringCandidates.length).toBeGreaterThan(0);
        } finally {
            hmProcess.kill();
        }

    }, 30000); // 30s timeout for MCP spinup
});