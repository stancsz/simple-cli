import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;
const HEALTH_MONITOR_PORT = process.env.HEALTH_MONITOR_PORT ? parseInt(process.env.HEALTH_MONITOR_PORT) : 3001;

app.use(cors());
app.use(express.static(join(__dirname, 'frontend', 'dist')));

// Store logs in memory
const MAX_LOGS = 1000;
let logs: string[] = [];
let clients: any[] = [];

function broadcastLog(message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    logs.push(logEntry);
    if (logs.length > MAX_LOGS) logs.shift();

    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ message: logEntry })}\n\n`);
    });
}

// Endpoint to trigger the demo
let demoProcess: any = null;

app.get('/api/trigger-demo', (req, res) => {
    if (demoProcess) {
        return res.status(409).json({ message: "Demo already running" });
    }

    const demoDir = resolve(__dirname, '../simple-cli-showcase');
    const repoRoot = resolve(__dirname, '../../');
    const demoScript = join(demoDir, 'run_demo.ts');

    console.log(`Starting demo script ${demoScript} from root ${repoRoot}...`);
    broadcastLog("System: Starting Showcase Demo...");

    // Spawn the process from REPO ROOT so MCP can find mcp.json and src/mcp_servers
    // We use 'bun' as the command, assuming it is in PATH.
    // We set PORT for health_monitor.
    const env = { ...process.env, PORT: String(HEALTH_MONITOR_PORT), FORCE_COLOR: '1' };

    demoProcess = spawn('bun', ['run', demoScript], {
        cwd: repoRoot,
        env,
        shell: false
    });

    demoProcess.stdout.on('data', (data: any) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) broadcastLog(line.trim());
        });
    });

    demoProcess.stderr.on('data', (data: any) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
            if (line.trim()) broadcastLog(`ERROR: ${line.trim()}`);
        });
    });

    demoProcess.on('close', (code: number) => {
        broadcastLog(`System: Demo process exited with code ${code}`);
        demoProcess = null;
    });

    res.json({ message: "Demo started" });
});

// SSE Endpoint for logs
app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send existing logs
    logs.forEach(log => {
        res.write(`data: ${JSON.stringify({ message: log })}\n\n`);
    });

    clients.push(res);

    req.on('close', () => {
        clients = clients.filter(c => c !== res);
    });
});

// Proxy Metrics
app.get('/api/metrics', async (req, res) => {
    try {
        const response = await fetch(`http://localhost:${HEALTH_MONITOR_PORT}/api/dashboard/metrics`);
        if (!response.ok) {
            throw new Error(`Health Monitor responded with ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (e: any) {
        res.status(503).json({ error: "Health Monitor unavailable", details: e.message });
    }
});

// Serve frontend for any other route
app.get('*', (req, res) => {
    const indexFile = join(__dirname, 'frontend', 'dist', 'index.html');
    if (existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(404).send("Frontend not built. Run 'npm run build' in frontend directory.");
    }
});

app.listen(PORT, () => {
    console.log(`Showcase Dashboard Server running on http://localhost:${PORT}`);
});
