const fs = require('fs');
const path = require('path');
const util = require('util');
function writeLine(msg) {
  try { fs.appendFileSync(path.resolve(process.cwd(), '.cli_uncaught.log'), msg + '\n'); } catch (e) {}
}
process.on('uncaughtException', (err) => {
  writeLine('[uncaughtException] ' + (err && err.stack ? err.stack : util.inspect(err)));
  try { fs.appendFileSync(path.resolve(process.cwd(), '.cli_uncaught_full.json'), JSON.stringify({ ts: new Date().toISOString(), err: util.inspect(err, { depth: null }) })); } catch (_) {}
  console.error('UncaughtException (logged to .cli_uncaught.log)');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  writeLine('[unhandledRejection] ' + util.inspect(reason, { depth: null }));
  try { fs.appendFileSync(path.resolve(process.cwd(), '.cli_uncaught_full.json'), JSON.stringify({ ts: new Date().toISOString(), rejection: util.inspect(reason, { depth: null }) })); } catch (_) {}
});
