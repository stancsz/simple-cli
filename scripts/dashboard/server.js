import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;
const HEALTH_MONITOR_URL = process.env.HEALTH_MONITOR_URL || 'http://localhost:3004';
const AGENT_DIR = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');

function getMetricFiles(days) {
  if (!fs.existsSync(METRICS_DIR)) return [];
  const files = fs.readdirSync(METRICS_DIR);
  const sorted = files.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
  return sorted.slice(-days).map(f => join(METRICS_DIR, f));
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

const distPath = join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
} else {
    // Fallback for testing/dev
    app.use(express.static(__dirname));
}

// Proxy dashboard API calls to Health Monitor
app.use('/api/dashboard', async (req, res) => {
    try {
        const url = `${HEALTH_MONITOR_URL}/api/dashboard${req.url}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Health Monitor responded with ${response.status}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/company_metrics', async (req, res) => {
    try {
        const response = await fetch(`${HEALTH_MONITOR_URL}/api/metrics`);
        if (!response.ok) {
            throw new Error(`Health Monitor responded with ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Failed to fetch metrics:', error);
        res.status(500).json({ error: error.message });
    }
});

// Legacy Endpoint for raw metrics (backward compatibility)
app.get('/api/metrics', (req, res) => {
    const timeframe = req.query.timeframe || 'last_hour';
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

    allMetrics.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    res.json(allMetrics);
});

app.listen(PORT, () => {
    console.log(`Dashboard server running on port ${PORT}`);
    console.log(`Health Monitor URL: ${HEALTH_MONITOR_URL}`);
});
