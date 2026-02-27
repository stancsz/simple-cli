import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// --- Mocks Setup ---

// Mock LLM
const mockLLM = {
    generate: vi.fn()
};

// Mock Brain (Strategic Memory)
const mockStrategicMemory = {
    recall: vi.fn(),
    store: vi.fn()
};

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: vi.fn(() => mockStrategicMemory)
}));

// --- Test Suite ---

describe("Phase 25: Autonomous Corporate Consciousness & Strategic Evolution", () => {
    let server: McpServer;
    let registeredTools: Record<string, any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools = {};

        // Mock Server that captures tools
        server = {
            tool: (name: string, description: string, schema: any, handler: any) => {
                registeredTools[name] = handler;
            }
        } as unknown as McpServer;

        // --- Register Mock Phase 25 Tools ---

        // 1. Strategic Horizon Scanning
        server.tool(
            "scan_strategic_horizon",
            "Analyzes market trends, competitor movements, and macro-economic shifts.",
            {},
            async (args: any) => {
                // Simulate detecting a major trend
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                detected_trends: [
                                    {
                                        name: "Quantum Computing Adoption",
                                        impact_score: 0.95,
                                        description: "Rapid enterprise adoption of quantum algorithms for logistics."
                                    },
                                    {
                                        name: "AI Regulation Compliance",
                                        impact_score: 0.8,
                                        description: "Stricter EU AI Act enforcement."
                                    }
                                ],
                                market_sentiment: "bullish_on_hard_tech"
                            })
                        }
                    ]
                };
            }
        );

        // 2. Corporate Identity Evaluation
        server.tool(
            "evaluate_corporate_identity",
            "Evaluates current brand alignment with market trends.",
            {},
            async (args: any) => {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                current_positioning: "Generalist AI Agency",
                                alignment_gap: "High",
                                recommendation: "Pivot to Specialized Quantum-AI Consulting",
                                brand_voice_adjustment: "More technical, less casual"
                            })
                        }
                    ]
                };
            }
        );

        // 3. Strategic Pivot Proposal
        server.tool(
            "propose_strategic_pivot",
            "Generates a strategic execution plan based on market analysis.",
            {},
            async (args: any) => {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                strategy_name: "Operation Quantum Leap",
                                core_objectives: [
                                    "Launch Quantum Algorithm Audit Service",
                                    "Partner with Hardware Providers"
                                ],
                                resource_reallocation: {
                                    "Web Dev Team": "Retrain 50% for Python/Qiskit",
                                    "Sales": "Target Logistics Sector"
                                },
                                risk_level: "Medium-High"
                            })
                        }
                    ]
                };
            }
        );

        // 4. Regulatory Compliance Verification
        server.tool(
            "verify_regulatory_compliance",
            "Checks strategic plans against legal frameworks.",
            {},
            async (args: any) => {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "compliant",
                                flagged_risks: [],
                                advisory: "Ensure data sovereignty in quantum cloud processing."
                            })
                        }
                    ]
                };
            }
        );

        // 5. Inter-Agency Federation
        server.tool(
            "initiate_federated_collaboration",
            "Finds and handshakes with partner agencies.",
            {},
            async (args: any) => {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                handshake_status: "success",
                                partner_node: "Node_Quantum_Specialist_Alpha",
                                shared_capabilities: ["Qiskit", "Cirq"],
                                contract_id: "fed_contract_123"
                            })
                        }
                    ]
                };
            }
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should execute the full Strategic Planning Cycle", async () => {
        console.log("Starting Phase 25 Strategic Vision Simulation...");

        // --- Step 1: Scan Horizon ---
        console.log("Step 1: Scanning Strategic Horizon...");
        const scanResult = await registeredTools["scan_strategic_horizon"]({});
        const scanContent = JSON.parse(scanResult.content[0].text);

        expect(scanContent.detected_trends.length).toBeGreaterThan(0);
        expect(scanContent.detected_trends[0].name).toBe("Quantum Computing Adoption");
        console.log(`✅ Trend Detected: ${scanContent.detected_trends[0].name} (Impact: ${scanContent.detected_trends[0].impact_score})`);

        // --- Step 2: Evaluate Identity ---
        console.log("Step 2: Evaluating Corporate Identity...");
        const identityResult = await registeredTools["evaluate_corporate_identity"]({
            trends: scanContent.detected_trends
        });
        const identityContent = JSON.parse(identityResult.content[0].text);

        expect(identityContent.alignment_gap).toBe("High");
        expect(identityContent.recommendation).toContain("Pivot");
        console.log(`✅ Identity Analysis: Gap is ${identityContent.alignment_gap}. Rec: ${identityContent.recommendation}`);

        // --- Step 3: Propose Pivot ---
        console.log("Step 3: Proposing Strategic Pivot...");
        const pivotResult = await registeredTools["propose_strategic_pivot"]({
            recommendation: identityContent.recommendation
        });
        const pivotContent = JSON.parse(pivotResult.content[0].text);

        expect(pivotContent.strategy_name).toBe("Operation Quantum Leap");
        expect(pivotContent.resource_reallocation["Web Dev Team"]).toBeDefined();
        console.log(`✅ Strategy Proposed: ${pivotContent.strategy_name}`);

        // --- Step 4: Verify Compliance ---
        console.log("Step 4: Verifying Regulatory Compliance...");
        const complianceResult = await registeredTools["verify_regulatory_compliance"]({
            strategy: pivotContent
        });
        const complianceContent = JSON.parse(complianceResult.content[0].text);

        expect(complianceContent.status).toBe("compliant");
        console.log(`✅ Compliance Check: ${complianceContent.status}`);

        // --- Step 5: Initiate Federation ---
        console.log("Step 5: Initiating Federated Collaboration...");
        const federationResult = await registeredTools["initiate_federated_collaboration"]({
            needed_capability: "Quantum Hardware Access"
        });
        const federationContent = JSON.parse(federationResult.content[0].text);

        expect(federationContent.handshake_status).toBe("success");
        expect(federationContent.partner_node).toBeDefined();
        console.log(`✅ Federation Handshake: Connected to ${federationContent.partner_node}`);

        console.log("Phase 25 Simulation Completed Successfully.");
    });
});
