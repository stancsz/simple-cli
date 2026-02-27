import { EpisodicMemory } from "../brain/episodic.js";
import { CorporatePolicy } from "../brain/schemas.js";
import { dirname } from "path";
import { FleetStatus } from "../mcp_servers/business_ops/tools/swarm_fleet_management.js";

// Initialize Episodic Memory (singleton-ish for this module)
const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

/**
 * Retrieves the latest active corporate policy for a given company.
 */
export async function getLatestPolicy(company: string = "default"): Promise<CorporatePolicy | null> {
    // We search for "corporate_policy" type memories.
    // Since episodic.recall is semantic, we rely on the type filter and sorting.
    try {
        const memories = await episodic.recall("corporate_policy", 10, company, "corporate_policy");
        if (!memories || memories.length === 0) return null;

        const policies = memories
            .map(m => {
                try {
                    return JSON.parse(m.agentResponse) as CorporatePolicy;
                } catch {
                    return null;
                }
            })
            .filter((p): p is CorporatePolicy => p !== null && p.isActive)
            .sort((a, b) => b.version - a.version); // Descending version

        return policies.length > 0 ? policies[0] : null;
    } catch (error) {
        console.error(`Error fetching policy for ${company}:`, error);
        return null;
    }
}

/**
 * Interface extending FleetStatus with Policy Compliance info.
 */
export interface PolicyCompliantFleetStatus extends FleetStatus {
    policy_version?: number;
    compliance_status: "compliant" | "violation";
    violations?: string[];
    active_policy_summary?: string;
}

/**
 * Applies the active policy to the fleet status, checking for compliance.
 */
export function applyPolicyToFleet(fleetStatus: FleetStatus, policy: CorporatePolicy | null): PolicyCompliantFleetStatus {
    if (!policy) {
        return {
            ...fleetStatus,
            compliance_status: "compliant", // No policy = compliant by default? Or warning? Let's say compliant.
            active_policy_summary: "No active policy"
        };
    }

    const violations: string[] = [];

    // Check Max Agents
    if (fleetStatus.active_agents > policy.parameters.max_agents_per_swarm) {
        violations.push(`Active agents (${fleetStatus.active_agents}) exceeds max (${policy.parameters.max_agents_per_swarm})`);
    }

    // Check Margin (Mock calculation since fleetStatus doesn't have margin directly,
    // but in a real app we'd calculate it. Here we simulate a check if margin is available)
    // For now, we'll just check if health is "strained" and risk is "low", flag it.
    if (policy.parameters.risk_tolerance === "low" && fleetStatus.health === "strained") {
        violations.push("Swarm health is strained while risk tolerance is LOW.");
    }

    return {
        ...fleetStatus,
        policy_version: policy.version,
        compliance_status: violations.length > 0 ? "violation" : "compliant",
        violations: violations.length > 0 ? violations : undefined,
        active_policy_summary: `${policy.name} v${policy.version} (Risk: ${policy.parameters.risk_tolerance})`
    };
}
