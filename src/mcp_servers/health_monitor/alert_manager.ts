import { join, dirname } from "path";
import { existsSync } from "fs";
import { readFile, writeFile, mkdir, appendFile } from "fs/promises";
import { App } from "@slack/bolt";

export interface AlertRule {
    metric: string;
    threshold: number;
    operator: ">" | "<" | ">=" | "<=" | "==";
    contact?: string; // e.g. "slack:#channel", "https://webhook.url"
    created_at: string;
}

export class AlertManager {
    private slackApp?: App;
    private rulesFile: string;
    private alertsLogFile: string;

    constructor(baseDir: string = process.cwd()) {
        const agentDir = join(baseDir, '.agent');
        this.rulesFile = join(agentDir, 'alert_rules.json');
        this.alertsLogFile = join(agentDir, 'alerts_log.ndjson');

        if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
            this.slackApp = new App({
                token: process.env.SLACK_BOT_TOKEN,
                signingSecret: process.env.SLACK_SIGNING_SECRET
            });
        }
    }

    /**
     * Add a new alert rule.
     */
    async addRule(rule: AlertRule) {
        let rules: AlertRule[] = [];
        if (existsSync(this.rulesFile)) {
            try {
                rules = JSON.parse(await readFile(this.rulesFile, 'utf-8'));
            } catch {}
        } else {
             const dir = dirname(this.rulesFile);
             if (!existsSync(dir)) {
                 await mkdir(dir, { recursive: true });
             }
        }
        rules.push(rule);
        await writeFile(this.rulesFile, JSON.stringify(rules, null, 2));
    }

    /**
     * Get all alert rules.
     */
    async getRules(): Promise<AlertRule[]> {
        if (!existsSync(this.rulesFile)) return [];
        try {
            return JSON.parse(await readFile(this.rulesFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    /**
     * Check metrics against rules and trigger alerts.
     */
    async checkAlerts(metrics: any[]): Promise<string[]> {
        const rules = await this.getRules();
        if (rules.length === 0) return [];

        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        const recentMetrics = metrics.filter((m: any) => (now - new Date(m.timestamp).getTime()) < fiveMinutes);

        const alerts: string[] = [];

        for (const rule of rules) {
            const relevant = recentMetrics.filter((m: any) =>
                m.metric === rule.metric || `${m.agent}:${m.metric}` === rule.metric
            );

            if (relevant.length === 0) continue;

            const avgValue = relevant.reduce((sum: number, m: any) => sum + m.value, 0) / relevant.length;

            let triggered = false;
            if (rule.operator === ">" && avgValue > rule.threshold) triggered = true;
            if (rule.operator === "<" && avgValue < rule.threshold) triggered = true;
            if (rule.operator === ">=" && avgValue >= rule.threshold) triggered = true;
            if (rule.operator === "<=" && avgValue <= rule.threshold) triggered = true;

            if (triggered) {
                const msg = `ALERT: ${rule.metric} is ${avgValue.toFixed(2)} (${rule.operator} ${rule.threshold})`;
                alerts.push(msg);
                await this.sendAlert(rule, msg);
            }
        }
        return alerts;
    }

    /**
     * Send an alert via configured channels.
     */
    async sendAlert(rule: AlertRule, message: string) {
        const timestamp = new Date().toISOString();
        console.error(message); // Always log to stderr

        // Log to file for history
        try {
            const entry = { timestamp, message, rule };
            await appendFile(this.alertsLogFile, JSON.stringify(entry) + '\n');
        } catch (e) {
            console.error("Failed to write to alert log:", e);
        }

        // Slack
        if (this.slackApp && rule.contact?.startsWith("slack")) {
             let channel = process.env.SLACK_CHANNEL_ID || "general";
             if (rule.contact.includes(":")) {
                 const part = rule.contact.split(":")[1];
                 if (part) channel = part;
             }
             try {
                 await this.slackApp.client.chat.postMessage({
                     channel,
                     text: message
                 });
             } catch (e) {
                 console.error("Failed to send Slack alert:", e);
             }
        }

        // Webhook (Teams/Other)
        if (rule.contact?.startsWith("http")) {
            try {
                // Dynamic import to support ESM
                const fetch = (await import("node-fetch")).default;
                await fetch(rule.contact, {
                    method: 'POST',
                    body: JSON.stringify({ text: message }),
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                console.error("Failed to send Webhook alert:", e);
            }
        }
    }

    /**
     * Get recent alert history.
     */
    async getAlertHistory(limit: number = 50): Promise<any[]> {
        if (!existsSync(this.alertsLogFile)) return [];
        try {
            const content = await readFile(this.alertsLogFile, 'utf-8');
            return content.trim().split('\n')
                .map(line => { try { return JSON.parse(line); } catch { return null; } })
                .filter(Boolean)
                .reverse()
                .slice(0, limit);
        } catch {
            return [];
        }
    }
}
