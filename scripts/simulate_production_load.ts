export interface SimulationClient {
    callTool(name: string, args: any): Promise<any>;
}

export interface SimulationConfig {
    clientCount: number;
    durationHours: number;
    timeStepHours: number;
    demandThreshold: number;
    healthRiskThreshold: number;
}

export class ProductionLoadSimulator {
    private client: SimulationClient;
    private config: SimulationConfig;
    private clients: string[] = [];
    private logs: string[] = [];
    private currentTime: number = 0; // Simulated hours

    constructor(client: SimulationClient, config: Partial<SimulationConfig> = {}) {
        this.client = client;
        this.config = {
            clientCount: config.clientCount || 10,
            durationHours: config.durationHours || 72,
            timeStepHours: config.timeStepHours || 12,
            demandThreshold: config.demandThreshold || 5,
            healthRiskThreshold: config.healthRiskThreshold || 70
        };
    }

    private log(message: string) {
        const timestamp = `[T+${this.currentTime}h]`;
        const logMsg = `${timestamp} ${message}`;
        this.logs.push(logMsg);
        console.log(`[SIM] ${logMsg}`);
    }

    async initialize() {
        this.log("Initializing Production Load Simulation...");
        for (let i = 0; i < this.config.clientCount; i++) {
            const clientName = `MockClient_${i + 1}`;
            this.clients.push(clientName);
        }
        this.log(`Initialized ${this.clients.length} mock clients.`);
    }

    async runSimulation() {
        this.log(`Starting simulation for ${this.config.durationHours} hours (Step: ${this.config.timeStepHours}h)...`);

        while (this.currentTime < this.config.durationHours) {
            this.currentTime += this.config.timeStepHours;
            this.log(`--- Simulation Step ---`);

            await this.generateLoad();
            const evaluations = await this.evaluateFleet();
            await this.balanceFleet(evaluations);
            await this.checkHealth();

            // Wait a tiny bit to allow logs to flush if needed (simulation artifact)
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.log("--- Simulation Complete ---");
        await this.finalize();
    }

    private async generateLoad() {
        this.log("Generating simulated load...");
        let loadCount = 0;

        for (const client of this.clients) {
            // Randomly decide to add issues (30% chance per step)
            if (Math.random() > 0.7) {
                const issueCount = Math.floor(Math.random() * 3) + 1;
                loadCount += issueCount;

                // We create issues one by one to simulate activity
                for (let i = 0; i < issueCount; i++) {
                    try {
                        await this.client.callTool("create_linear_issue", {
                            projectId: `proj_${client}`,
                            title: `Simulated Load T+${this.currentTime} - ${i}`,
                            description: "Automated load generation for stress testing.",
                            priority: Math.random() > 0.8 ? 1 : 3
                        });
                    } catch (e) {
                         // Expect some failures if project doesn't exist in mock, handled by test setup
                         // console.error(`Failed to create issue for ${client}: ${(e as Error).message}`);
                    }
                }
            }
        }
        this.log(`Generated ${loadCount} new issues across fleet.`);
    }

    private async evaluateFleet() {
        this.log("Evaluating fleet demand...");
        try {
            const result = await this.client.callTool("evaluate_fleet_demand", {
                demand_threshold: this.config.demandThreshold
            });

            if (result.isError) {
                this.log(`Error in evaluate_fleet_demand: ${result.content[0].text}`);
                return [];
            }

            const data = JSON.parse(result.content[0].text);
            const recs = data.recommendations || [];

            const scaleUp = recs.filter((r: any) => r.recommendation === "scale_up").length;
            const scaleDown = recs.filter((r: any) => r.recommendation === "scale_down").length;

            this.log(`Evaluation result: ${scaleUp} Scale Up, ${scaleDown} Scale Down.`);
            return recs;
        } catch (e) {
            this.log(`Exception evaluating fleet: ${(e as Error).message}`);
            return [];
        }
    }

    private async balanceFleet(evaluations: any[]) {
        if (!evaluations || evaluations.length === 0) return;

        this.log("Balancing fleet resources...");
        try {
            const result = await this.client.callTool("balance_fleet_resources", { evaluations });

            if (result.isError) {
                this.log(`Error in balance_fleet_resources: ${result.content[0].text}`);
                return;
            }

            const data = JSON.parse(result.content[0].text);
            const actions = data.actions_taken || [];
            this.log(`Executed ${actions.length} balancing actions.`);
        } catch (e) {
            this.log(`Exception balancing fleet: ${(e as Error).message}`);
        }
    }

    private async checkHealth() {
        // Randomly check 20% of clients
        const sample = this.clients.filter(() => Math.random() > 0.8);
        if (sample.length === 0) return;

        this.log(`Checking predictive health for ${sample.length} clients...`);
        for (const client of sample) {
            try {
                // Mock tool call for health analysis
                // In a real scenario, this would query the Brain/CRM
                const result = await this.client.callTool("analyze_client_health", {
                    clientId: client, // Updated key to match tool definition
                    linearProjectId: `proj_${client}`,
                    contactEmail: `contact@${client.toLowerCase()}.com`
                });

                if (!result.isError) {
                    const data = JSON.parse(result.content[0].text);
                    const risk = data.riskScore || 0;

                    if (risk > this.config.healthRiskThreshold) {
                        this.log(`High risk detected for ${client} (${risk}). Triggering intervention.`);
                        await this.client.callTool("trigger_preemptive_intervention", {
                            client_id: client,
                            risk_score: risk,
                            reasons: ["Simulated risk threshold exceeded"]
                        });
                    }
                }
            } catch (e) {
                // Ignore errors (tool might not be registered in all test contexts)
            }
        }
    }

    private async finalize() {
        this.log("Finalizing simulation: Analyzing cross-swarm patterns...");
        try {
            // Trigger HR Loop for pattern analysis
            await this.client.callTool("analyze_cross_swarm_patterns", {
                timeframe: "72h"
            });

            // Simulate generating an SOP from the findings
            // In a real run, analyze might return pattern IDs to pass here.
            // For simulation, we assume a pattern was found.
            await this.client.callTool("generate_sop_from_patterns", {
                pattern_id: "simulated_pattern_opt_1"
            });
            this.log("SOP generation triggered.");
        } catch (e) {
            this.log(`Error finalizing: ${(e as Error).message}`);
        }
    }

    getLogs() {
        return this.logs;
    }
}
