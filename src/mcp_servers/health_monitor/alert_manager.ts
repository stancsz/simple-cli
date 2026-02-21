import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { v4 as uuidv4 } from 'uuid';

export interface AlertRule {
  id: string;
  metric: string;
  threshold: number;
  operator: ">" | "<" | ">=" | "<=" | "==";
  contact?: string; // e.g. "slack:webhook_url" or "email:addr"
  severity: "warning" | "critical";
  created_at: string;
}

export interface Alert {
  id: string;
  rule_id: string;
  metric: string;
  value: number;
  threshold: number;
  operator: string;
  status: "active" | "critical" | "resolved";
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export class AlertManager {
  private rulesFile: string;
  private alertsFile: string;
  private rules: AlertRule[] = [];
  private alerts: Alert[] = [];

  constructor(baseDir: string) {
    this.rulesFile = join(baseDir, "health", "alert_rules.json");
    this.alertsFile = join(baseDir, "health", "alerts.json");
  }

  async init() {
    await this.ensureDir(dirname(this.rulesFile));
    await this.loadRules();
    await this.loadAlerts();
  }

  private async ensureDir(dir: string) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async loadRules() {
    try {
      if (existsSync(this.rulesFile)) {
        const data = await readFile(this.rulesFile, "utf-8");
        this.rules = JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load alert rules:", error);
      this.rules = [];
    }
  }

  async saveRules() {
    await writeFile(this.rulesFile, JSON.stringify(this.rules, null, 2));
  }

  async loadAlerts() {
    try {
      if (existsSync(this.alertsFile)) {
        const data = await readFile(this.alertsFile, "utf-8");
        this.alerts = JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load alerts:", error);
      this.alerts = [];
    }
  }

  async saveAlerts() {
    await writeFile(this.alertsFile, JSON.stringify(this.alerts, null, 2));
  }

  async addRule(metric: string, threshold: number, operator: AlertRule["operator"], contact?: string, severity: "warning" | "critical" = "warning") {
    const rule: AlertRule = {
      id: uuidv4(),
      metric,
      threshold,
      operator,
      contact,
      severity,
      created_at: new Date().toISOString()
    };
    this.rules.push(rule);
    await this.saveRules();
    return rule;
  }

  async checkMetric(metric: string, value: number) {
    // Reload rules/alerts to ensure freshness in multi-process/tool scenarios?
    // For now, assume in-memory is mostly up to date, but maybe reload to be safe if CLI calls tools.
    // However, for high-frequency tracking, reloading files every time is bad.
    // Let's rely on in-memory state and save on changes.
    // Ideally we might want to reload occasionally.

    for (const rule of this.rules) {
      if (rule.metric !== metric && !metric.endsWith(`:${rule.metric}`)) continue;

      let triggered = false;
      if (rule.operator === ">" && value > rule.threshold) triggered = true;
      if (rule.operator === "<" && value < rule.threshold) triggered = true;
      if (rule.operator === ">=" && value >= rule.threshold) triggered = true;
      if (rule.operator === "<=" && value <= rule.threshold) triggered = true;
      if (rule.operator === "==" && value === rule.threshold) triggered = true;

      if (triggered) {
        await this.triggerAlert(rule, value);
      } else {
        // Auto-resolve if previously active?
        // This is complex. Usually you want manual resolution or a "recovery" threshold.
        // For now, let's keep it simple: manual resolution or explicit resolve call.
        // Or maybe if we see a "good" value, we resolve?
        // Let's stick to explicit resolution for now as per requirements ("resolve_alert" tool).
      }
    }
  }

  private async triggerAlert(rule: AlertRule, value: number) {
    // Check if there is an existing active alert for this rule
    const existing = this.alerts.find(a => a.rule_id === rule.id && a.status !== "resolved");

    if (existing) {
      existing.value = value;
      existing.updated_at = new Date().toISOString();
      await this.saveAlerts();
    } else {
      const alert: Alert = {
        id: uuidv4(),
        rule_id: rule.id,
        metric: rule.metric,
        value,
        threshold: rule.threshold,
        operator: rule.operator,
        status: "active", // Start as active (warning level implied usually, or rule severity)
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // If rule says critical initially, set it?
      // Requirement: "escalate from 'warning' to 'critical'" implies start at warning.
      // But if rule severity is critical, maybe start there.
      // Let's stick to "active" -> "critical" via escalation.

      this.alerts.push(alert);
      await this.saveAlerts();
      await this.sendNotification(alert, rule.contact);
    }
  }

  async checkEscalation() {
    const now = Date.now();
    let changed = false;

    for (const alert of this.alerts) {
      if (alert.status === "active") {
        const created = new Date(alert.created_at).getTime();
        // 5 minutes
        if (now - created > 5 * 60 * 1000) {
          alert.status = "critical";
          alert.updated_at = new Date().toISOString();
          changed = true;

          const rule = this.rules.find(r => r.id === alert.rule_id);
          await this.sendNotification(alert, rule?.contact, true);
        }
      }
    }

    if (changed) {
      await this.saveAlerts();
    }
  }

  async resolveAlert(id: string) {
    const alert = this.alerts.find(a => a.id === id);
    if (alert && alert.status !== "resolved") {
      alert.status = "resolved";
      alert.resolved_at = new Date().toISOString();
      alert.updated_at = new Date().toISOString();
      await this.saveAlerts();
      return true;
    }
    return false;
  }

  getActiveAlerts() {
    return this.alerts.filter(a => a.status !== "resolved");
  }

  private async sendNotification(alert: Alert, contact?: string, isEscalation: boolean = false) {
    const type = isEscalation ? "ESCALATED TO CRITICAL" : "ALERT";
    const msg = `[${type}] ${alert.metric} value ${alert.value} ${alert.operator} ${alert.threshold}`;
    console.error(msg); // Log to stderr so it shows up in logs

    if (contact) {
      if (contact.startsWith("slack:")) {
         // Stub for Slack
         console.log(`Sending Slack message to ${contact.substring(6)}: ${msg}`);
      } else if (contact.startsWith("email:")) {
         // Stub for Email
         console.log(`Sending Email to ${contact.substring(6)}: ${msg}`);
      } else {
         console.log(`Sending Generic Notification to ${contact}: ${msg}`);
      }
    }
  }
}
