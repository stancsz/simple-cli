import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEcosystemAuditReport, readAndFilterLogs, getStartDateFromTimeframe, matchesFocusArea } from '../../src/mcp_servers/ecosystem_auditor/tools.js';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock the LLM explicitly at the top level
vi.mock('../../src/llm/index.js', () => {
    return {
        createLLM: vi.fn(() => ({
            generate: vi.fn().mockResolvedValue({
                raw: `## Executive Summary\nAll is well.\n\n## Key Events\n- Spawned A\n\n## Policy Changes\n- Scale 2\n\n## Morphology Adjustments\n- Merge A and B\n\n## Anomalies & Risks\n- None\n\n## Recommendations\n- Keep going`
            })
        }))
    };
});

describe('ecosystem_auditor_report', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should calculate start date correctly', () => {
        const d1 = getStartDateFromTimeframe('last_24_hours');
        expect(Date.now() - d1.getTime()).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);

        const d2 = getStartDateFromTimeframe('last_7_days');
        expect(Date.now() - d2.getTime()).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000);

        const d3 = getStartDateFromTimeframe('all_time');
        expect(d3.getTime()).toBe(0);
    });

    it('should correctly filter focus areas', () => {
        const logEvent: any = { event_type: 'communication' };
        expect(matchesFocusArea(logEvent, 'all')).toBe(true);
        expect(matchesFocusArea(logEvent, 'communications')).toBe(true);
        expect(matchesFocusArea(logEvent, 'policy_changes')).toBe(false);
        expect(matchesFocusArea(logEvent, 'morphology_adjustments')).toBe(false);

        logEvent.event_type = 'spawn';
        expect(matchesFocusArea(logEvent, 'morphology_adjustments')).toBe(true);
    });

    it('should read and parse logs correctly, skipping invalid JSON', async () => {
        const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'ecosystem_audit_logs', 'sample_logs.jsonl');
        const validJsonl = await fs.readFile(fixturePath, 'utf-8');

        const mockJsonl = `${validJsonl}\n{"invalid":json}\n`;
        vi.spyOn(fs, 'readdir').mockResolvedValue(["ecosystem_logs_2026-03-14.jsonl"] as any);
        vi.spyOn(fs, 'readFile').mockResolvedValue(mockJsonl);

        // using epoch to include all
        const logs = await readAndFilterLogs(new Date(0), 'all');
        expect(logs.length).toBe(5);
        expect(logs[0].event_type).toBe('spawn');
    });

    it('should generate a synthesized markdown report', async () => {
        const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'ecosystem_audit_logs', 'sample_logs.jsonl');
        const validJsonl = await fs.readFile(fixturePath, 'utf-8');
        vi.spyOn(fs, 'readdir').mockResolvedValue(["ecosystem_logs_2026-03-14.jsonl"] as any);
        vi.spyOn(fs, 'readFile').mockResolvedValue(validJsonl);

        const report = await generateEcosystemAuditReport({
            // Use epoch equivalent string to ensure date passes
            timeframe: 'all_time',
            focus_area: 'all'
        });

        expect(report.report_id).toMatch(/^audit-/);
        expect(report.timeframe).toBe('all_time');
        expect(report.focus_area).toBe('all');

        expect(report.summary).toContain('Executive Summary');
        expect(report.summary).toContain('Key Events');
    });

    it('should handle missing log files gracefully', async () => {
        const error = new Error('Not found') as any;
        error.code = 'ENOENT';
        vi.spyOn(fs, 'readdir').mockRejectedValue(error);

        const report = await generateEcosystemAuditReport({ timeframe: 'last_24_hours' });

        expect(report.events).toEqual([]);
        expect(report.summary).toMatch(/No logs found/);
    });
});
