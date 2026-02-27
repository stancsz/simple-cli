import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface SimulationClient {
    callTool(name: string, args: any): Promise<any>;
}

export interface EconomicSimulationConfig {
    quarter: number;
    year: number;
    days: number;
    outputDir: string;
}

export class EconomicCycleSimulator {
    private client: SimulationClient;
    private config: EconomicSimulationConfig;
    private logs: string[] = [];
    private currentTime: number = 0; // Days

    constructor(client: SimulationClient, config: Partial<EconomicSimulationConfig> = {}) {
        this.client = client;
        this.config = {
            quarter: config.quarter || 1,
            year: config.year || new Date().getFullYear(),
            days: config.days || 90,
            outputDir: config.outputDir || '.'
        };
    }

    private log(message: string) {
        const timestamp = `[Day ${this.currentTime}]`;
        const logMsg = `${timestamp} ${message}`;
        this.logs.push(logMsg);
        console.log(`[ECO-SIM] ${logMsg}`);
    }

    async run() {
        this.log(`Starting Economic Cycle Simulation Q${this.config.quarter} ${this.config.year}...`);

        try {
            // Step 1: Baseline Analysis
            const metrics = await this.analyzePerformance();

            // Step 2: Market Context
            const marketData = await this.gatherMarketIntelligence();

            // Step 3: Strategy Formulation
            const pricingRecs = await this.optimizePricing(metrics);
            const serviceRecs = await this.adjustServices(metrics);

            // Step 4: Resource Planning
            const resourcePlan = await this.planResources(metrics);

            // Step 5: Executive Reporting
            const report = await this.generateReport(metrics, marketData, pricingRecs, serviceRecs, resourcePlan);

            // Save Report
            await this.saveReport(report);

            this.log("Simulation Complete.");
        } catch (e) {
            this.log(`Simulation Failed: ${(e as Error).message}`);
            throw e;
        }
    }

    private async analyzePerformance() {
        this.log("Phase 1: Analyzing Performance Metrics...");
        this.currentTime = 5; // Simulating time passage
        const result = await this.client.callTool("analyze_performance_metrics", {
            timeframe: "last_quarter"
        });

        if (result.isError) throw new Error(`Performance Analysis Failed: ${result.content[0].text}`);
        this.log("Performance baseline established.");
        return JSON.parse(result.content[0].text);
    }

    private async gatherMarketIntelligence() {
        this.log("Phase 2: Gathering Market Intelligence...");
        this.currentTime = 15;

        // 2a. General Market Data
        const marketRes = await this.client.callTool("collect_market_data", {
            sector: "Software Development",
            region: "Global",
            query: "Q1 Trends"
        });
        const marketData = JSON.parse(marketRes.content[0].text);

        // 2b. Competitor Pricing (Simulated URLs)
        this.log("Analyzing competitors...");
        await this.client.callTool("analyze_competitor_pricing", {
            competitor_urls: ["https://example-competitor-a.com", "https://example-competitor-b.com"],
            force_refresh: true
        });

        return marketData;
    }

    private async optimizePricing(metrics: any) {
        this.log("Phase 3: Optimizing Pricing Strategy...");
        this.currentTime = 30;

        // Mock current services based on metrics context (or just hardcoded for sim)
        const currentServices = [
            { name: "Web App Development", current_price: 15000, cost: 8000 },
            { name: "AI Consultation", current_price: 5000, cost: 1000 },
            { name: "Maintenance Retainer", current_price: 2000, cost: 500 }
        ];

        const result = await this.client.callTool("optimize_pricing_strategy", {
            current_services: currentServices
        });

        if (result.isError) throw new Error("Pricing Optimization Failed");
        const text = result.content[0].text;
        let recs = [];
        try {
             recs = JSON.parse(text);
             if (!Array.isArray(recs)) recs = [recs]; // Robustness
        } catch (e) {
             this.log(`Warning: Failed to parse pricing recommendations: ${text}`);
        }
        this.log(`Generated ${recs.length || 0} pricing recommendations.`);
        return recs;
    }

    private async adjustServices(metrics: any) {
        this.log("Phase 4: Adjusting Service Offerings...");
        this.currentTime = 45;

        const result = await this.client.callTool("adjust_service_offerings", {
            analysis_period: "last_quarter"
        });

        if (result.isError) throw new Error("Service Adjustment Failed");
        const text = result.content[0].text;
        let recs = [];
        try {
            recs = JSON.parse(text);
            if (!Array.isArray(recs)) recs = [recs];
        } catch (e) {
            this.log(`Warning: Failed to parse service recommendations: ${text}`);
        }
        this.log(`Proposed ${recs.length} new service bundles.`);
        return recs;
    }

    private async planResources(metrics: any) {
        this.log("Phase 5: Planning Resource Allocation...");
        this.currentTime = 60;

        const result = await this.client.callTool("allocate_resources_optimally", {
            dry_run: true // Simulation mode
        });

        if (result.isError) throw new Error("Resource Allocation Failed");
        const plan = JSON.parse(result.content[0].text);
        this.log(`Resource plan generated with ${plan.recommendations.length} actions.`);
        return plan;
    }

    private async generateReport(metrics: any, market: any, pricing: any, services: any, resources: any) {
        this.log("Phase 6: Generating Final Executive Report...");
        this.currentTime = 90;

        const result = await this.client.callTool("generate_business_insights", {
            metrics: JSON.stringify(metrics),
            market_analysis: JSON.stringify(market),
            pricing_recommendations: JSON.stringify(pricing)
        });

        // Combine all sections into a comprehensive markdown
        const executiveSummary = result.content[0].text;

        const fullReport = `
# Economic Optimization Report - Q${this.config.quarter} ${this.config.year}
**Date:** ${new Date().toISOString().split('T')[0]}
**Status:** VALIDATED via Simulation

## 1. Executive Summary
${executiveSummary}

## 2. Performance Baseline (Q${this.config.quarter - 1})
- **Revenue:** $${metrics.financial.revenue.toLocaleString()}
- **Profit Margin:** ${(metrics.financial.margin * 100).toFixed(1)}%
- **Delivery Efficiency:** ${(metrics.delivery.efficiency * 100).toFixed(1)}%
- **Client Satisfaction:** ${metrics.client.satisfactionScore}/100

## 3. Market Context
- **Growth Rate:** ${market.market_growth_rate}
- **Key Trends:**
${market.key_trends.map((t: string) => `  - ${t}`).join('\n')}

## 4. Strategic Recommendations

### 4.1 Pricing Strategy
| Service | Current | Recommended | Confidence | Reasoning |
|---------|---------|-------------|------------|-----------|
${pricing.map((p: any) => `| ${p.service_name} | $${p.current_price} | $${p.recommended_price} | ${(p.confidence_score * 100).toFixed(0)}% | ${p.reasoning} |`).join('\n')}

### 4.2 New Service Bundles
${services.map((s: any) => `
**${s.bundle_name}** ($${s.recommended_price})
- *${s.description}*
- Target: ${s.target_client_profile}
- Expected Margin: ${(s.expected_margin * 100).toFixed(0)}%
`).join('\n')}

## 5. Resource Forecast
${resources.recommendations.map((r: any) => `- **${r.companyName}**: ${r.recommendation.toUpperCase()} (Confidence: ${r.confidence_score}%) - ${r.reasoning}`).join('\n')}

---
*Generated by Autonomous Economic Engine*
`;

        return fullReport;
    }

    private async saveReport(content: string) {
        const filename = `economic_optimization_report_Q${this.config.quarter}_${this.config.year}.md`;
        const filepath = join(this.config.outputDir, filename);

        await mkdir(this.config.outputDir, { recursive: true });
        await writeFile(filepath, content);

        this.log(`Report saved to ${filepath}`);
    }

    getLogs() {
        return this.logs;
    }
}
