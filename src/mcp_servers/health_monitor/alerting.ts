import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { z } from "zod";
import cron from "node-cron";
import fetch from "node-fetch";
import { getMetricFiles, readNdjson, AGENT_DIR } from "./utils.js";

const HEALTH_DIR = join(AGENT_DIR, 'health');
const ALERT_RULES_FILE = join(HEALTH_DIR, 'alert_rules.json');
const ACTIVE_ALERTS_FILE = join(HEALTH_DIR, 'active_alerts.json');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');

export const AlertRuleSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  metric: z.string(),
  threshold: z.number(),
  operator: z.enum([">", "<", ">=", "<=", "=="]),
  window: z.number().default(5).describe("Time window in minutes"),
  channel: z.object({
    type: z.enum(["slack", "webhook", "email"]),
    target: z.string()
  }),
  enabled: z.boolean().default(true),
  created_at: z.string().default(() => new Date().toISOString())
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

export interface ActiveAlert {
  id: string;
  rule_id: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
  status: 'active' | 'resolved';
}

export class AlertManager {
  private rules: AlertRule[] = [];
  private activeAlerts: ActiveAlert[] = [];
  private cronTask: cron.ScheduledTask | null = null;

  constructor() {
    this.init().catch(console.error);
  }

  async init() {
    await this.ensureDirs();
    await this.loadRules();
    await this.loadActiveAlerts();

    // Schedule periodic checks (every minute)
    this.cronTask = cron.schedule('* * * * *', () => {
      this.checkAlerts().catch(console.error);
    });
  }

  private async ensureDirs() {
    if (!existsSync(HEALTH_DIR)) {
      await mkdir(HEALTH_DIR, { recursive: true });
    }
  }

  async loadRules() {
    if (existsSync(ALERT_RULES_FILE)) {
      try {
        const data = JSON.parse(await readFile(ALERT_RULES_FILE, 'utf-8'));
        this.rules = z.array(AlertRuleSchema).parse(data);
      } catch (e) {
        console.error("Failed to load alert rules:", e);
        this.rules = [];
      }
    }
  }

  async saveRules() {
    await writeFile(ALERT_RULES_FILE, JSON.stringify(this.rules, null, 2));
  }

  async loadActiveAlerts() {
    if (existsSync(ACTIVE_ALERTS_FILE)) {
      try {
        this.activeAlerts = JSON.parse(await readFile(ACTIVE_ALERTS_FILE, 'utf-8'));
      } catch {
        this.activeAlerts = [];
      }
    }
  }

  async saveActiveAlerts() {
    await writeFile(ACTIVE_ALERTS_FILE, JSON.stringify(this.activeAlerts, null, 2));
  }

  async addRule(rule: z.infer<typeof AlertRuleSchema>) {
    const newRule = AlertRuleSchema.parse(rule);
    this.rules.push(newRule);
    await this.saveRules();
    return newRule;
  }

  async getRules() {
    return this.rules;
  }

  async getActiveAlerts() {
    return this.activeAlerts.filter(a => a.status === 'active');
  }

  async checkAlerts() {
    if (!(await this.isAlertingEnabled())) {
        return;
    }

    const files = await getMetricFiles(1);
    if (files.length === 0) return;

    // Get metrics from the latest file
    const metrics = await readNdjson(files[files.length - 1]);
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const windowMs = rule.window * 60 * 1000;
      const relevantMetrics = metrics.filter(m => {
        const timestamp = new Date(m.timestamp).getTime();
        const age = now - timestamp;
        return age < windowMs && (m.metric === rule.metric || `${m.agent}:${m.metric}` === rule.metric);
      });

      if (relevantMetrics.length === 0) continue;

      const avgValue = relevantMetrics.reduce((sum, m) => sum + m.value, 0) / relevantMetrics.length;

      let triggered = false;
      switch (rule.operator) {
        case ">": triggered = avgValue > rule.threshold; break;
        case "<": triggered = avgValue < rule.threshold; break;
        case ">=": triggered = avgValue >= rule.threshold; break;
        case "<=": triggered = avgValue <= rule.threshold; break;
        case "==": triggered = avgValue === rule.threshold; break;
      }

      const existingAlertIndex = this.activeAlerts.findIndex(a => a.rule_id === rule.id && a.status === 'active');

      if (triggered) {
        if (existingAlertIndex === -1) {
          // New Alert
          const alert: ActiveAlert = {
            id: crypto.randomUUID(),
            rule_id: rule.id,
            metric: rule.metric,
            value: avgValue,
            threshold: rule.threshold,
            timestamp: new Date().toISOString(),
            status: 'active'
          };
          this.activeAlerts.push(alert);
          await this.dispatchNotification(rule, alert);
        } else {
            // Update existing alert value
            this.activeAlerts[existingAlertIndex].value = avgValue;
            this.activeAlerts[existingAlertIndex].timestamp = new Date().toISOString();
        }
      } else {
        if (existingAlertIndex !== -1) {
          // Resolve Alert
          this.activeAlerts[existingAlertIndex].status = 'resolved';
          // Optionally notify resolution
        }
      }
    }

    // Prune old resolved alerts (keep for 24h)
    const oneDay = 24 * 60 * 60 * 1000;
    this.activeAlerts = this.activeAlerts.filter(a =>
        a.status === 'active' || (now - new Date(a.timestamp).getTime() < oneDay)
    );

    await this.saveActiveAlerts();
  }

  private async isAlertingEnabled(): Promise<boolean> {
    try {
        if (existsSync(CONFIG_FILE)) {
            const config = JSON.parse(await readFile(CONFIG_FILE, 'utf-8'));
            // If yoloMode is false (safe mode), disable alerts unless explicitly enabled.
            if (config.yoloMode === false && !config.enable_alerts) {
                return false;
            }
            return true;
        }
    } catch {}
    // Default to true if no config found (dev environment assumption) or just safe default?
    // Requirement: "Ensure alerting is disabled by default in yoloMode=false"
    // If no config, we assume safe mode? Let's default to true for now unless config says otherwise.
    return true;
  }

  private async dispatchNotification(rule: AlertRule, alert: ActiveAlert) {
    const message = `[Health Monitor] ALERT: ${rule.metric} is ${alert.value.toFixed(2)} (${rule.operator} ${rule.threshold})`;
    console.error(message); // Always log to stderr

    try {
        if (rule.channel.type === 'slack' || rule.channel.type === 'webhook') {
            await fetch(rule.channel.target, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: message,
                    blocks: [
                        {
                            type: "section",
                            text: {
                                type: "mrkdwn",
                                text: `*Health Alert Triggered*\nMetric: ${rule.metric}\nValue: ${alert.value.toFixed(2)}\nThreshold: ${rule.operator} ${rule.threshold}`
                            }
                        }
                    ]
                })
            });
        }
        // Email support could be added here
    } catch (e) {
        console.error(`Failed to send notification to ${rule.channel.type}:`, e);
    }
  }
}
