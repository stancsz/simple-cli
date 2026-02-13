import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "child_process";
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const TEST_DIR = join(process.cwd(), "temp_concurrent_airflow");
const LOG_FILE = join(
  process.cwd(),
  "docs/feedbacks/concurrent-airflow.log.md",
);
const TIMEOUT = 300000; // 5 minutes

describe("Concurrent Airflow Pipeline Test", () => {
  beforeAll(() => {
    // Cleanup existing test dir and log
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }

    // Ensure log directory exists
    if (!existsSync(join(process.cwd(), "docs/feedbacks"))) {
      mkdirSync(join(process.cwd(), "docs/feedbacks"), { recursive: true });
    }

    writeFileSync(LOG_FILE, "# Concurrent Airflow Pipeline Test Log\n\n");

    // Create the test directory
    mkdirSync(TEST_DIR, { recursive: true });

    // Create .agent directory
    mkdirSync(join(TEST_DIR, ".agent"), { recursive: true });

    // Create config.json for the 'worker' agent
    // Points to the same CLI source, using ts-node loader
    const cliPath = resolve(process.cwd(), "src", "cli.ts");
    const configFile = join(TEST_DIR, ".agent", "config.json");

    const config = {
      agents: {
        worker: {
          command: process.execPath,
          args: ["--loader", "ts-node/esm", cliPath, "--non-interactive", "--"],
          env: { MODEL: process.env.MODEL || "openai:gpt-5-mini" },
          supports_stdin: false,
        },
      },
    };

    writeFileSync(configFile, JSON.stringify(config, null, 2));
    writeFileSync(
      LOG_FILE,
      `## Config\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n`,
      { flag: "a" },
    );
  });

  afterAll(() => {
    // Optional cleanup
    if (process.env.CLEANUP !== "false") {
      // rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it(
    "should concurrently delegate tasks to setup an airflow pipeline",
    async () => {
      const prompt = `
You are a Lead Data Engineer.
I need you to set up an Airflow ingestion pipeline from Yahoo Finance to a local SQLite database.
Please break this down into subtasks and delegate them to the 'worker' agent concurrently (async: true).

The tasks are:
1. Create a python script 'fetch_data.py' that uses yfinance to download 1 month of AAPL data and saves it to 'aapl.csv'.
2. Create a python script 'load_data.py' that reads 'aapl.csv' (assume it exists) and loads it into a SQLite database 'finance.db' table 'stock_prices'.
3. Create a python script 'airflow_dag.py' that defines an Airflow DAG 'finance_ingestion' with two tasks: 'fetch' (BashOperator running fetch_data.py) and 'load' (BashOperator running load_data.py).

After delegating these tasks, use 'check_task_status' in a loop to wait until they are all completed.
Do NOT retry the delegation if the status is 'running'. Just wait and check again.
Do NOT create the files yourself unless the worker fails.
Once all tasks are completed, verify the files exist.
If everything is good, say "PIPELINE SETUP COMPLETE".
`;

      writeFileSync(LOG_FILE, `## Prompt\n${prompt}\n\n## Execution Log\n`, {
        flag: "a",
      });

      await new Promise<void>((resolve, reject) => {
        const entryTs = join(process.cwd(), "src", "cli.ts");

        // Use ts-node/esm loader to run src/cli.ts
        // Main agent also runs non-interactively with the prompt
        const cliProcess = spawn(
          process.execPath,
          ["--loader", "ts-node/esm", entryTs, TEST_DIR, prompt],
          {
            env: {
              ...process.env,
              MODEL: process.env.MODEL || "openai:gpt-5-mini",
            },
            stdio: "pipe",
          },
        );

        cliProcess.stdout.on("data", (data) => {
          const chunk = data.toString();
          // process.stdout.write(chunk); // Uncomment for debugging
          writeFileSync(LOG_FILE, chunk, { flag: "a" });
        });

        cliProcess.stderr.on("data", (data) => {
          const chunk = data.toString();
          // process.stderr.write(chunk); // Uncomment for debugging
          writeFileSync(LOG_FILE, chunk, { flag: "a" });
        });

        const timeout = setTimeout(() => {
          cliProcess.kill();
          reject(new Error("Test timed out after 5 minutes"));
        }, TIMEOUT);

        cliProcess.on("close", (code) => {
          clearTimeout(timeout);
          writeFileSync(LOG_FILE, `\n\nEXIT CODE: ${code}\n`, { flag: "a" });
          if (code === 0) resolve();
          else reject(new Error(`CLI exited with code ${code}`));
        });

        cliProcess.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Verification
      const fetchPath = join(TEST_DIR, "fetch_data.py");
      const loadPath = join(TEST_DIR, "load_data.py");
      const dagPath = join(TEST_DIR, "airflow_dag.py");

      expect(existsSync(fetchPath), "fetch_data.py should exist").toBe(true);
      expect(existsSync(loadPath), "load_data.py should exist").toBe(true);
      expect(existsSync(dagPath), "airflow_dag.py should exist").toBe(true);

      const fetchContent = readFileSync(fetchPath, "utf-8");
      const loadContent = readFileSync(loadPath, "utf-8");
      const dagContent = readFileSync(dagPath, "utf-8");

      expect(fetchContent).toContain("yfinance");
      expect(loadContent).toContain("sqlite3");
      expect(dagContent).toContain("DAG");
      expect(dagContent).toContain("BashOperator");
    },
    TIMEOUT,
  );
});
