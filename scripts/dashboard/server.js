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
const HEALTH_DIR = path.join(AGENT_DIR, 'health');
const ALERT_RULES_FILE = path.join(HEALTH_DIR, 'alert_rules.json');
const ACTIVE_ALERTS_FILE = path.join(HEALTH_DIR, 'active_alerts.json');

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

  // Normalize path to prevent directory traversal
  const pathname = parsedUrl.pathname;

  // Serve static files from public/
  if (pathname.startsWith('/public/')) {
    const filePath = path.join(__dirname, pathname);
    // Basic security check
    if (!filePath.startsWith(path.join(__dirname, 'public'))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      if (filePath.endsWith('.js')) res.writeHead(200, { 'Content-Type': 'application/javascript' });
      else if (filePath.endsWith('.css')) res.writeHead(200, { 'Content-Type': 'text/css' });
      else res.writeHead(200);
      res.end(data);
    });
    return;
  }

  // Serve index.html
  if (pathname === '/' || pathname === '/index.html') {
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

  // API Endpoint: Metrics
  if (pathname === '/api/metrics') {
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

  // API Endpoint: Alerts
  if (pathname === '/api/alerts') {
    let rules = [];
    let alerts = [];
    try {
        if (fs.existsSync(ALERT_RULES_FILE)) rules = JSON.parse(fs.readFileSync(ALERT_RULES_FILE, 'utf-8'));
        if (fs.existsSync(ACTIVE_ALERTS_FILE)) alerts = JSON.parse(fs.readFileSync(ACTIVE_ALERTS_FILE, 'utf-8'));
    } catch {}

    // Filter active alerts
    alerts = alerts.filter(a => a.status === 'active');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rules, alerts }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
