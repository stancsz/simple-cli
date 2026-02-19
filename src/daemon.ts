import { MCP } from './mcp.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'daemon.log');

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  try {
    if (!existsSync(AGENT_DIR)) {
      await mkdir(AGENT_DIR, { recursive: true });
    }
    await appendFile(LOG_FILE, line);
  } catch (e) {
    console.error(`Failed to write log: ${e}`);
  }
  console.log(line.trim());
}

async function main() {
  await log("Daemon starting...");
  await log(`CWD: ${CWD}`);

  const mcp = new MCP();
  await mcp.init();

  // Ensure scheduler server is started
  try {
      if (!mcp.isServerRunning('scheduler')) {
          await mcp.startServer('scheduler');
          await log("Scheduler MCP server started.");
      }
  } catch (e: any) {
      await log(`Failed to start scheduler server: ${e.message}`);
      // If scheduler fails, we can't do anything. Exit.
      process.exit(1);
  }

  const client = mcp.getClient('scheduler');
  if (!client) {
      await log("Failed to get scheduler client.");
      process.exit(1);
  }

  // Loop
  const loop = async () => {
      try {
          const result: any = await client.callTool({
              name: "execute_scheduled_tasks",
              arguments: {}
          });

          if (result && result.content && result.content[0] && result.content[0].text) {
              const text = result.content[0].text;
              if (text !== "No tasks due.") {
                  await log(`[Scheduler] ${text}`);
              }
          }
      } catch (e: any) {
          await log(`Error calling scheduler: ${e.message}`);
      }
  };

  // Run immediately then interval
  await loop();
  setInterval(loop, 10000); // Check every 10 seconds

  // Handle cleanup
  const cleanup = async (signal: string) => {
      await log(`Daemon stopping (${signal})...`);
      try {
          await mcp.stopServer('scheduler');
      } catch (e) {}
      process.exit(0);
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
}

main().catch(err => log(`Daemon fatal error: ${err}`));
