import { Alert } from "./alert_correlator.js";
import { log } from "@clack/prompts";

export function isWorkingHours(): boolean {
    const now = new Date();
    const day = now.getDay(); // 0 is Sunday
    const hour = now.getHours();

    // Mon-Fri, 9am - 5pm
    if (day === 0 || day === 6) return false;
    if (hour < 9 || hour >= 17) return false;
    return true;
}

async function sendWithBackoff(fn: () => Promise<void>, retries = 3, delay = 1000) {
    for (let i = 0; i <= retries; i++) {
        try {
            await fn();
            return;
        } catch (e) {
            if (i === retries) {
                console.error("Failed to send alert after retries:", e);
                return; // Swallow error after max retries
            }
            await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
    }
}

async function sendSlackAlert(message: string) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
        // console.log("SLACK_WEBHOOK_URL not set, skipping Slack alert.");
        return;
    }

    await sendWithBackoff(async () => {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message })
        });
        if (!res.ok) throw new Error(`Slack API error: ${res.statusText}`);
    });
}

async function sendEmailAlert(subject: string, body: string) {
    // Mock implementation or use nodemailer if available
    // For now, we just log if SMTP vars are present, or skip
    if (process.env.SMTP_HOST) {
        // console.log(`[Email Alert] Subject: ${subject}\nBody: ${body}`);
    }
}

export async function sendAlert(alert: Alert) {
    const isCritical = alert.metric.includes("error") || alert.metric.includes("failure") || alert.message.includes("critical");

    // Non-critical alerts are suppressed outside working hours
    if (!isCritical && !isWorkingHours()) {
        return;
    }

    const message = `[${isCritical ? "CRITICAL" : "ALERT"}] ${alert.message} (Metric: ${alert.metric})`;

    await sendSlackAlert(message);
    await sendEmailAlert(`Alert: ${alert.metric}`, message);

    // Log to console for visibility
    if (isCritical) {
        console.error(message);
    } else {
        console.warn(message);
    }
}
