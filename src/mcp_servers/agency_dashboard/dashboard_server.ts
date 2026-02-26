import express from "express";
import { join } from "path";
import { existsSync } from "fs";
import { DataAggregator } from "./data_aggregator.js";

export async function createDashboardServer(port: number) {
    const app = express();
    const aggregator = new DataAggregator();

    // CORS
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    // API Endpoints
    app.get("/api/agency/fleet", async (req, res) => {
        const data = await aggregator.getSwarmFleetStatus();
        res.json(data);
    });

    app.get("/api/agency/financial", async (req, res) => {
        const data = await aggregator.getFinancialKPIs();
        res.json(data);
    });

    app.get("/api/agency/system-health", async (req, res) => {
        const data = await aggregator.getSystemHealth();
        res.json(data);
    });

    app.get("/api/agency/client-health", async (req, res) => {
        const data = await aggregator.getClientHealth();
        res.json(data);
    });

    // Serve Static Files (React App)
    // We assume the build output is in scripts/dashboard/dist_agency
    const distPath = join(process.cwd(), "scripts", "dashboard", "dist_agency");

    if (existsSync(distPath)) {
        app.use(express.static(distPath, { index: "agency_index.html" }));
        // SPA fallback
        app.get("*", (req, res) => {
             res.sendFile(join(distPath, "agency_index.html"));
        });
    } else {
        console.warn(`Dashboard build not found at ${distPath}. Serving placeholder.`);
        app.get("/", (req, res) => {
            res.send("Agency Dashboard is running. Build output not found. Please run 'npm run build:agency' in scripts/dashboard.");
        });
    }

    return app.listen(port, () => {
        console.log(`Agency Dashboard running at http://localhost:${port}`);
    });
}
