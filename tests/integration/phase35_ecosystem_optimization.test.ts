import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assign_task_with_ecosystem_insights } from '../../src/mcp_servers/scheduler/tools.js';
import { update_company_with_ecosystem_insights } from '../../src/mcp_servers/company_context/tools.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                store: vi.fn().mockResolvedValue(true),
                recall: vi.fn().mockImplementation(async (topic, limit, namespace, type) => {
                    if (topic === "ecosystem_policy") {
                        return [{
                            id: "policy_1",
                            solution: JSON.stringify({
                                target_agencies: "all",
                                parameters: { max_agents: 5 }
                            })
                        }];
                    }
                    if (topic === "agency_spawning") {
                        return [
                            { id: "spawn_1", tags: ["agency_react_dev"], request: "role: React Developer" },
                            { id: "spawn_2", tags: ["agency_python_dev"], request: "role: Python Developer" },
                            { id: "spawn_3", tags: ["agency_qa_tester"], request: "role: QA Tester" }
                        ];
                    }
                    if (topic === "company attributes") {
                        return [{
                            id: "attr_1",
                            solution: JSON.stringify({ industry: "tech", size: "enterprise" })
                        }];
                    }
                    return [];
                })
            };
        })
    };
});

// Mock LLM
vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn().mockImplementation(() => {
            return {
                generate: vi.fn().mockImplementation(async (prompt) => {
                    if (prompt.includes("Ecosystem Optimization Scheduler")) {
                        return { message: JSON.stringify({ agency_id: "agency_react_dev", reasoning: "Strong match for frontend tasks." }) };
                    }
                    if (prompt.includes("Ecosystem Optimization Engine")) {
                        return { message: JSON.stringify(["Adopt React for frontend.", "Increase QA automation."]) };
                    }
                    return { message: "{}" };
                }),
                embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
            };
        })
    };
});

// Mock LanceDB
vi.mock('@lancedb/lancedb', () => {
    return {
        connect: vi.fn().mockResolvedValue({
            tableNames: vi.fn().mockResolvedValue(["documents"]),
            openTable: vi.fn().mockResolvedValue({
                add: vi.fn().mockResolvedValue(true)
            }),
            createTable: vi.fn().mockResolvedValue({
                add: vi.fn().mockResolvedValue(true)
            })
        })
    };
});

describe("Phase 35: Ecosystem Optimization Validation", () => {
    let memoryInstance: EpisodicMemory;

    beforeEach(() => {
        vi.clearAllMocks();
        memoryInstance = new EpisodicMemory(process.cwd());
    });

    it("1. Scheduler uses ecosystem patterns for predictive task assignment", async () => {
        const taskDescription = "Build a new landing page using React and Tailwind CSS.";
        const taskRequirements = "Frontend development, React, CSS.";

        const result = await assign_task_with_ecosystem_insights(taskDescription, taskRequirements, memoryInstance);

        expect(result).toBeDefined();
        expect(result.agency_id).toBe("agency_react_dev");
        expect(result.reasoning).toContain("match");
    });

    it("2. Company Context tool integrates meta-learning findings", async () => {
        const companyId = "test-company-123";

        const result = await update_company_with_ecosystem_insights(companyId, memoryInstance);

        expect(result).toBeDefined();
        expect(result).toContain("Successfully applied 2 ecosystem insights");
        expect(memoryInstance.store).toHaveBeenCalledWith(
            "meta_learning_update",
            "Update company with ecosystem insights",
            expect.stringContaining("Adopt React for frontend"),
            ["ecosystem_insights"],
            companyId,
            [],
            false,
            "",
            undefined,
            0,
            0,
            "meta_learning_insight"
        );
    });

    it("3. Scheduler handles edge case: no spawned agencies", async () => {
        // Override mock specifically for this test
        const noAgencyMemory = new EpisodicMemory(process.cwd());
        noAgencyMemory.recall = vi.fn().mockImplementation(async (topic) => {
            if (topic === "ecosystem_policy") return [{ id: "policy_1", solution: "{}" }];
            if (topic === "agency_spawning") return []; // No agencies
            return [];
        });

        const result = await assign_task_with_ecosystem_insights("test", "test", noAgencyMemory);

        expect(result.agency_id).toBe("local");
        expect(result.reasoning).toContain("No spawned child agencies found");
    });

    it("4. Company Context handles edge case: no ecosystem policy", async () => {
        const noPolicyMemory = new EpisodicMemory(process.cwd());
        noPolicyMemory.recall = vi.fn().mockImplementation(async (topic) => {
            if (topic === "ecosystem_policy") return []; // No policy
            return [];
        });

        const result = await update_company_with_ecosystem_insights("test-company-123", noPolicyMemory);

        expect(result).toContain("No ecosystem policies found");
    });
});
