const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function writeLog(name, text) {
  try {
    fs.appendFileSync(path.join(process.cwd(), name), `${new Date().toISOString()} ${text}\n`);
  } catch (e) {}
}

const origFork = cp.fork;
const origSpawn = cp.spawn;

function attachChild(child, meta) {
  try {
    if (!child || !child.pid) return;
    const pid = child.pid;
    const stderrPath = `.vitest_worker_${pid}_stderr.log`;
    const metaPath = `.vitest_worker_${pid}_meta.log`;
    writeLog(metaPath, `SPAWN ${meta}`);

    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (d) => {
        try { fs.appendFileSync(path.join(process.cwd(), stderrPath), d.toString()); } catch (e) {}
      });
    }

    child.on('exit', (code, signal) => {
      writeLog(metaPath, `EXIT code=${code} signal=${signal}`);
    });

    child.on('error', (err) => {
      writeLog(metaPath, `ERROR ${err && err.stack ? err.stack : String(err)}`);
    });
  } catch (e) {}
}

cp.fork = function(modulePath, args, options) {
  try {
    const child = origFork.apply(this, arguments);
    const meta = `fork module=${modulePath} args=${JSON.stringify(args)} opts=${JSON.stringify(options)}`;
    attachChild(child, meta);
    return child;
  } catch (e) {
    writeLog('.vitest_parent_error.log', `fork failed ${e && e.stack ? e.stack : e}`);
    throw e;
  }
};

cp.spawn = function() {
  try {
    const child = origSpawn.apply(this, arguments);
    const meta = `spawn args=${JSON.stringify(Array.from(arguments))}`;
    attachChild(child, meta);
    return child;
  } catch (e) {
    writeLog('.vitest_parent_error.log', `spawn failed ${e && e.stack ? e.stack : e}`);
    throw e;
  }
};

// Also monkey-patch exec/execFile for coverage
const origExec = cp.exec;
cp.exec = function() {
  const child = origExec.apply(this, arguments);
  try { attachChild(child, `exec args=${JSON.stringify(Array.from(arguments))}`); } catch (e) {}
  return child;
};

const origExecFile = cp.execFile;
cp.execFile = function() {
  const child = origExecFile.apply(this, arguments);
  try { attachChild(child, `execFile args=${JSON.stringify(Array.from(arguments))}`); } catch (e) {}
  return child;
};

// Small startup note so we know preload ran
writeLog('.vitest_tracer.log', `tracer preloaded in pid=${process.pid} argv=${process.argv.join(' ')}`);
