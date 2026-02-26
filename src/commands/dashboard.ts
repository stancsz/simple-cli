import { spawn, exec } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { createServer } from 'net';
import pc from 'picocolors';

const HEALTH_MONITOR_PORT = 3004;
const AGENCY_DASHBOARD_PORT = 3002;

function checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

function openUrl(url: string) {
    const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');
    exec(`${start} ${url}`);
}

export async function dashboardCommand() {
    const args = process.argv.slice(2);
    const isAgency = args.includes('--agency');

    if (isAgency) {
        console.log(pc.cyan(`Initializing Agency Dashboard (Phase 23)...`));
        const port = AGENCY_DASHBOARD_PORT;
        const url = `http://localhost:${port}`;

        const isRunning = await checkPort(port);
        if (isRunning) {
            console.log(pc.green(`Agency Dashboard is running. Opening dashboard at ${url}`));
            openUrl(url);
            return;
        }

        console.log(pc.yellow(`Agency Dashboard not running on port ${port}. Starting it...`));

        const distPath = join(process.cwd(), "dist", "mcp_servers", "agency_dashboard", "index.js");
        const srcPath = join(process.cwd(), "src", "mcp_servers", "agency_dashboard", "index.ts");

        let command = "node";
        let spawnArgs: string[] = [];

        if (existsSync(distPath)) {
            spawnArgs = [distPath];
        } else if (existsSync(srcPath)) {
            command = "npx";
            spawnArgs = ["tsx", srcPath];
        } else {
            console.error(pc.red("Could not find agency_dashboard server script."));
            return;
        }

        const env = { ...process.env, PORT: String(port) };

        const subprocess = spawn(command, spawnArgs, {
            env,
            stdio: 'inherit',
            detached: false
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log(pc.green(`Agency Dashboard server started.`));
        console.log(pc.dim(`Press Ctrl+C to stop.`));

        openUrl(url);

        await new Promise(() => {}); // Keep alive
        return;
    }

    console.log(pc.cyan(`Initializing Jules Operational Dashboard...`));

    const isRunning = await checkPort(HEALTH_MONITOR_PORT);
    const url = `http://localhost:${HEALTH_MONITOR_PORT}`;

    if (isRunning) {
        console.log(pc.green(`Health Monitor is running. Opening dashboard at ${url}`));
        openUrl(url);
        return;
    }

    console.log(pc.yellow(`Health Monitor not running on port ${HEALTH_MONITOR_PORT}. Starting it...`));

    // Locate the script
    const distPath = join(process.cwd(), "dist", "mcp_servers", "health_monitor", "index.js");
    const srcPath = join(process.cwd(), "src", "mcp_servers", "health_monitor", "index.ts");

    let command = "node";
    let spawnArgs: string[] = [];

    if (existsSync(distPath)) {
        spawnArgs = [distPath];
    } else if (existsSync(srcPath)) {
        command = "npx";
        spawnArgs = ["tsx", srcPath];
    } else {
        console.error(pc.red("Could not find health_monitor server script."));
        return;
    }

    const env = { ...process.env, PORT: String(HEALTH_MONITOR_PORT) };

    const subprocess = spawn(command, spawnArgs, {
        env,
        stdio: 'inherit',
        detached: false
    });

    // Wait a bit for it to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(pc.green(`Dashboard server started.`));
    console.log(pc.dim(`Press Ctrl+C to stop.`));

    openUrl(url);

    // Keep process alive to keep server running
    await new Promise(() => {});
}
