import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import { join } from 'path';

// Helper to wait for a condition
const waitFor = async (condition: () => Promise<boolean> | boolean, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await condition()) return true;
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
};

// Mock Slack API Server
let mockSlackServer: any;
let lastSlackMessage: string | null = null;
const MOCK_PORT = 3001;

const startMockSlack = () => new Promise<void>((resolve) => {
    mockSlackServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.url?.includes('/chat.postMessage')) {
                const parsed = JSON.parse(body);
                console.log('Mock Slack received:', parsed.text);
                lastSlackMessage = parsed.text;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, ts: '1234567890.123456', message: { ts: '1234567890.123456' } }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
    });
    mockSlackServer.listen(MOCK_PORT, resolve);
});

const stopMockSlack = () => new Promise<void>((resolve) => {
    mockSlackServer.close(() => resolve());
});

describe('Agency Stack Full Integration (Docker)', () => {
    // Increase timeout for Docker ops
    const TIMEOUT = 180000;

    beforeAll(async () => {
        // Start Mock Slack
        await startMockSlack();

        // Ensure clean state
        try {
            console.log('Cleaning up old containers...');
            execSync('docker compose -f docker-compose.yml -f docker-compose.test.yml down -v', { stdio: 'inherit' });
            execSync('rm -rf .agent-test', { stdio: 'inherit' });
        } catch {}

        // Start Stack
        console.log('Starting Docker Stack...');
        execSync('docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build', { stdio: 'inherit' });

        // Wait for Slack Interface to be ready
        console.log('Waiting for service to be ready...');
        const ready = await waitFor(async () => {
            try {
                // Bolt app usually responds to /slack/events with 404/405 if GET, or we can just check tcp
                 const res = await fetch('http://localhost:3000/');
                 return true;
            } catch (e) {
                return false;
            }
        }, 60000);

        if (!ready) {
            console.error("Service failed to start. Logs:");
            try {
                execSync('docker compose -f docker-compose.yml -f docker-compose.test.yml logs', { stdio: 'inherit' });
            } catch {}
            throw new Error("Service did not start in time");
        }

        // Give a bit more time for internal initialization (DBs, etc.)
        await new Promise(r => setTimeout(r, 10000));
    }, TIMEOUT);

    afterAll(async () => {
        // Stop Stack
        try {
            if (!process.env.SKIP_CLEANUP) {
                execSync('docker compose -f docker-compose.yml -f docker-compose.test.yml down -v', { stdio: 'inherit' });
            }
        } catch {}

        // Stop Mock Slack
        await stopMockSlack();
    });

    const sendSlackMessage = async (text: string) => {
        lastSlackMessage = null;
        const event = {
            token: "verification_token",
            team_id: "T12345",
            api_app_id: "A12345",
            event: {
                type: "app_mention",
                user: "U12345",
                text: `<@U0123456> ${text}`,
                ts: Date.now().toString(),
                channel: "C12345",
                event_ts: Date.now().toString()
            },
            type: "event_callback",
            event_id: `Ev${Date.now()}`,
            event_time: Math.floor(Date.now() / 1000)
        };

        const crypto = await import('crypto');
        const timestamp = Math.floor(Date.now() / 1000);
        const signatureBase = `v0:${timestamp}:${JSON.stringify(event)}`;
        const signature = 'v0=' + crypto.createHmac('sha256', 'test').update(signatureBase).digest('hex');

        console.log(`Sending message: "${text}"`);
        const res = await fetch('http://localhost:3000/slack/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Slack-Request-Timestamp': timestamp.toString(),
                'X-Slack-Signature': signature
            },
            body: JSON.stringify(event)
        });

        if (!res.ok) {
            console.error(`Failed to send message: ${res.status} ${res.statusText}`);
            const txt = await res.text();
            console.error(txt);
        }
    };

    it('Context Verification: Loads Acme Corp guidelines', async () => {
        await sendSlackMessage("What is our brand voice? --company acme");

        // Wait for response in mock slack
        const received = await waitFor(() => !!lastSlackMessage, 30000);

        if (!received) {
             console.log("Timed out waiting for response. Last known:", lastSlackMessage);
             // Dump logs for debugging
             execSync('docker compose -f docker-compose.yml -f docker-compose.test.yml logs slack-interface', { stdio: 'inherit' });
        }

        expect(received).toBe(true);
        expect(lastSlackMessage).toContain("Acme Corp");
        expect(lastSlackMessage).toMatch(/professional/i);
    }, 60000);

    it('Brain Integration: Recalls past decisions', async () => {
        // Check "Past Decisions" doc loaded via RAG
        await sendSlackMessage("What backend technology did we decide to use? --company acme");

        const received = await waitFor(() => !!lastSlackMessage && lastSlackMessage.includes("TypeScript"), 30000);
        if (!received) console.log("Response was:", lastSlackMessage);

        expect(lastSlackMessage).toContain("TypeScript");
    }, 60000);

    it('Ghost Mode: Scheduling task via chat', async () => {
         await sendSlackMessage("Schedule a one-time task to run 'echo GHOST_ACTIVE' in 10 seconds. --company acme");

         const received = await waitFor(() => !!lastSlackMessage && /scheduled|task/i.test(lastSlackMessage || ""), 30000);
         if (!received) console.log("Response was:", lastSlackMessage);

         expect(lastSlackMessage).toMatch(/scheduled|task/i);
    }, 60000);
});
