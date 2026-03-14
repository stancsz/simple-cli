import * as fs from 'fs/promises';
import * as path from 'path';
import { AuditEvent } from './types.js';
import crypto from 'crypto';

export class AuditLogger {
    private logsDir: string;
    private logFilePath: string;

    constructor() {
        const baseDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), '.agent');
        this.logsDir = path.join(baseDir, 'ecosystem_audit', 'logs');
        this.logFilePath = path.join(this.logsDir, 'audit.jsonl');
    }

    private async ensureDir() {
        try {
            await fs.access(this.logsDir);
        } catch {
            await fs.mkdir(this.logsDir, { recursive: true });
        }
    }

    public async logEvent(eventParams: Omit<AuditEvent, 'event_id' | 'timestamp'>): Promise<AuditEvent> {
        await this.ensureDir();

        const event: AuditEvent = {
            event_id: `aud-${crypto.randomBytes(8).toString('hex')}`,
            timestamp: new Date().toISOString(),
            ...eventParams,
        };

        const jsonLine = JSON.stringify(event) + '\n';
        await fs.appendFile(this.logFilePath, jsonLine, 'utf-8');

        return event;
    }

    public async fetchLogs(timeframeMinutes?: number, focusArea?: string, agencyId?: string): Promise<AuditEvent[]> {
        let lines: string[] = [];
        try {
            const data = await fs.readFile(this.logFilePath, 'utf-8');
            lines = data.trim().split('\n').filter(line => line.length > 0);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return []; // No logs yet
            }
            throw error;
        }

        const logs: AuditEvent[] = lines.map(line => JSON.parse(line));

        let filteredLogs = logs;

        // Filter by timeframe
        if (timeframeMinutes) {
            const cutoff = new Date(Date.now() - timeframeMinutes * 60 * 1000).getTime();
            filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= cutoff);
        }

        // Filter by focus area
        if (focusArea && focusArea !== 'all') {
            if (focusArea === 'communications') {
                filteredLogs = filteredLogs.filter(log => log.event_type === 'cross_agency_communication');
            } else if (focusArea === 'policy_changes') {
                filteredLogs = filteredLogs.filter(log => log.event_type === 'policy_change');
            } else if (focusArea === 'morphology_adjustments') {
                filteredLogs = filteredLogs.filter(log => log.event_type === 'morphology_adjustment');
            }
        }

        // Filter by agency ID (ensure data isolation/targeted retrieval)
        if (agencyId) {
            filteredLogs = filteredLogs.filter(log =>
                (log.source_agency === agencyId) ||
                (log.target_agency === agencyId) ||
                (log.agencies_involved && log.agencies_involved.includes(agencyId))
            );
        }

        return filteredLogs;
    }
}

// Singleton export
export const auditLogger = new AuditLogger();
