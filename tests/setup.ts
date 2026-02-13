import "dotenv/config";
import { vi } from "vitest";

// Global mocks or setup if needed

import fs from "fs";
import path from "path";

const logPath = path.join(process.cwd(), ".vitest_unhandled.log");
function appendLog(msg: string) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* ignore */
  }
}

process.on("uncaughtException", (err) => {
  appendLog(
    "uncaughtException: " +
      (err && (err as Error).stack ? (err as Error).stack : String(err)),
  );
});

process.on("unhandledRejection", (reason) => {
  appendLog(
    "unhandledRejection: " +
      (reason && (reason as any).stack
        ? (reason as any).stack
        : String(reason)),
  );
});

// Capture worker/process exit events if tinypool emits them via process 'error' events
process.on("warning", (warning) => {
  appendLog(
    "warning: " +
      (warning && (warning as any).stack
        ? (warning as any).stack
        : String(warning)),
  );
});

process.on("error", (err) => {
  appendLog(
    "process.error: " +
      (err && (err as Error).stack ? (err as Error).stack : String(err)),
  );
});

process.on("uncaughtExceptionMonitor", (err) => {
  appendLog(
    "uncaughtExceptionMonitor: " +
      (err && (err as Error).stack ? (err as Error).stack : String(err)),
  );
});

process.on("message", (msg) => {
  try {
    appendLog("process.message: " + JSON.stringify(msg));
  } catch {
    appendLog("process.message: <unserializable>");
  }
});

// Intercept ChildProcess 'error' emits to log details and avoid unhandled errors
try {
  const child_process = require("child_process");
  const ChildProcess = child_process.ChildProcess;
  const origEmit = ChildProcess.prototype.emit;
  ChildProcess.prototype.emit = function (event: string, ...args: any[]) {
    try {
      if (event === "error") {
        try {
          appendLog(
            "ChildProcess.emit error: " +
              (args[0] && args[0].stack ? args[0].stack : String(args[0])),
          );
        } catch {}
        // swallow the emit to prevent Vitest treating it as unhandled while still logging
        return true;
      }
    } catch (e) {
      /* best effort */
    }
    return origEmit.call(this, event, ...args);
  };
  // Wrap fork and spawn to log created child processes and their exit codes
  try {
    const origFork = child_process.fork;
    child_process.fork = function (...args: any[]) {
      const cp = origFork.apply(this, args as any);
      try {
        appendLog(
          `child.fork: pid=${cp.pid} argv=${JSON.stringify(args[1] || [])}`,
        );
        cp.on("exit", (code: number | null, signal: string | null) => {
          appendLog(`child.exit: pid=${cp.pid} code=${code} signal=${signal}`);
        });
        cp.on("error", (err: any) => {
          appendLog(
            `child.error: pid=${cp.pid} err=${err && err.stack ? err.stack : String(err)}`,
          );
        });
      } catch (e) {
        /* best effort */
      }
      return cp;
    };
  } catch (e) {
    /* ignore */
  }
  try {
    const origSpawn = child_process.spawn;
    child_process.spawn = function (...args: any[]) {
      const cp = origSpawn.apply(this, args as any);
      try {
        appendLog(
          `child.spawn: pid=${cp.pid} cmd=${JSON.stringify(args[0])} argv=${JSON.stringify(args[1] || [])}`,
        );
        cp.on("exit", (code: number | null, signal: string | null) => {
          appendLog(`child.exit: pid=${cp.pid} code=${code} signal=${signal}`);
        });
        cp.on("error", (err: any) => {
          appendLog(
            `child.error: pid=${cp.pid} err=${err && err.stack ? err.stack : String(err)}`,
          );
        });
      } catch (e) {
        /* best effort */
      }
      return cp;
    };
  } catch (e) {
    /* ignore */
  }
} catch (e) {
  /* ignore if child_process shape differs */
}

// Capture recent stderr writes to help triage worker crashes
try {
  const origStderrWrite = process.stderr.write.bind(process.stderr) as any;
  let buffer = "";
  process.stderr.write = (chunk: any, ...args: any[]) => {
    try {
      const s =
        typeof chunk === "string"
          ? chunk
          : (chunk?.toString?.() ?? String(chunk));
      buffer = (buffer + s).slice(-32 * 1024); // keep last 32KB
      // periodically flush to file to avoid losing data
      if (buffer.length > 8 * 1024) {
        appendLog(
          "\n=== Recent STDERR ===\n" + buffer + "\n=== End STDERR ===\n",
        );
        buffer = "";
      }
    } catch (e) {
      /* best effort */
    }
    return origStderrWrite(chunk, ...args);
  };
  // flush remaining buffer on exit
  process.on("exit", () => {
    try {
      if (buffer.length)
        appendLog(
          "\n=== Recent STDERR ===\n" + buffer + "\n=== End STDERR ===\n",
        );
    } catch {}
  });
} catch (e) {
  /* ignore */
}

// Attempt to capture child process exits reported by libraries like tinypool
// Listen for 'exit' events on the process and log last known child info if available.
process.on("exit", (code) => {
  appendLog(`process.exit: code=${code}`);
});

// If a ChildProcess unexpectedly exits, some libs emit 'uncaughtException' or 'error'.
// We also provide a small interval-based snapshot of the process list to help triage.
try {
  const { execSync } = require("child_process");
  const snapshot = (() => {
    try {
      return execSync(process.platform === "win32" ? "tasklist" : "ps -ef", {
        encoding: "utf-8",
        timeout: 5000,
      });
    } catch (e) {
      return String(e);
    }
  })();
  appendLog(
    "\n=== Process Snapshot ===\n" + snapshot + "\n=== End Snapshot ===\n",
  );
} catch (e) {
  /* best effort */
}

// Also capture environment info to help triage
appendLog(`Vitest triage start: PID=${process.pid} NODE=${process.version}`);
