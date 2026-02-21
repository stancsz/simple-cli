import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;
const AGENT_DIR = path.join(process.cwd(), '.agent');
const METRICS_DIR = path.join(AGENT_DIR, 'metrics');
const ALERTS_LOG_FILE = path.join(AGENT_DIR, 'alerts_log.ndjson');

// Helper to get files for a range of days
function getMetricFiles(days) {
  if (!fs.existsSync(METRICS_DIR)) return [];
  const files = fs.readdirSync(METRICS_DIR);
  const sorted = files.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
  return sorted.slice(-days).map(f => path.join(METRICS_DIR, f));
}

function readNdjson(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return content.trim().split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // Serve static index.html
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html' || parsedUrl.pathname === '/dashboard') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // API Endpoint
  if (parsedUrl.pathname === '/api/metrics') {
    const timeframe = parsedUrl.query.timeframe || 'last_hour';
    let days = 1;
    if (timeframe === 'last_week') days = 7;

    const files = getMetricFiles(days);
    let allMetrics = [];
    for (const file of files) {
      allMetrics = allMetrics.concat(readNdjson(file));
    }

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    if (timeframe === 'last_hour') {
      allMetrics = allMetrics.filter(m => (now - new Date(m.timestamp).getTime()) < oneHour);
    } else if (timeframe === 'last_day') {
      allMetrics = allMetrics.filter(m => (now - new Date(m.timestamp).getTime()) < oneDay);
    }

    // Sort by timestamp
    allMetrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(allMetrics));
    return;
  }

  // API Alerts
  if (parsedUrl.pathname === '/api/alerts') {
      if (!fs.existsSync(ALERTS_LOG_FILE)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
          return;
      }
      try {
          const content = fs.readFileSync(ALERTS_LOG_FILE, 'utf-8');
          const alerts = content.trim().split('\n')
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean)
            .reverse()
            .slice(0, 50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(alerts));
      } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Failed to read alerts" }));
      }
      return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
