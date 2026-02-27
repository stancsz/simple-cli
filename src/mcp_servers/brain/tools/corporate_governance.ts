import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";

/**
 * Updates the operating policy for a specific swarm or globally.
 * Stores the policy as a 'corporate_policy' type memory in the Brain.
 */
export const updateOperatingPolicy = async (
  episodic: EpisodicMemory,
  policyData: {
    swarmId?: string;
    policy: Record<string, any>;
    effectiveFrom: string;
    issuedBy: string;
  },
  company?: string
): Promise<CorporatePolicy> => {
  const timestamp = Date.now();

  const newPolicy: CorporatePolicy = {
    swarmId: policyData.swarmId,
    policy: policyData.policy,
    effectiveFrom: policyData.effectiveFrom,
    issuedBy: policyData.issuedBy,
    timestamp
  };

  // Construct a descriptive request string for the memory
  const scope = policyData.swarmId ? `Swarm: ${policyData.swarmId}` : "Global";
  const request = `Update Operating Policy [${scope}] by ${policyData.issuedBy}`;

  // Store in Brain
  await episodic.store(
    `policy_update_${timestamp}`, // taskId
    request, // userPrompt
    JSON.stringify(newPolicy), // agentResponse (solution)
    ["corporate_governance", "policy_update", "phase_25"], // artifacts
    company,
    undefined, // simulation_attempts
    undefined, // resolved_via_dreaming
    undefined, // dreaming_outcomes
    undefined, // id
    undefined, // tokens
    undefined, // duration
    "corporate_policy" // type
  );

  return newPolicy;
};

/**
 * Retrieves the latest active policies for a given swarm (including global policies).
 */
export const getActivePolicies = async (
  episodic: EpisodicMemory,
  swarmId?: string,
  company?: string
): Promise<CorporatePolicy[]> => {
  // 1. Recall memories of type 'corporate_policy'
  const memories = await episodic.recall(
    "operating policy update",
    20, // Fetch a reasonable number to find recent ones
    company,
    "corporate_policy"
  );

  if (!memories || memories.length === 0) {
    return [];
  }

  // 2. Parse and filter
  const policies: CorporatePolicy[] = [];
  const now = new Date();

  for (const memory of memories) {
    try {
      const policy: CorporatePolicy = JSON.parse(memory.agentResponse);

      // Check if effective (effectiveFrom <= now)
      if (new Date(policy.effectiveFrom) > now) {
        continue;
      }

      // Check scope: Global (no swarmId) OR Matching swarmId
      if (!policy.swarmId || (swarmId && policy.swarmId === swarmId)) {
        policies.push(policy);
      }
    } catch (e) {
      console.warn(`[Brain] Failed to parse policy memory ${memory.id}:`, e);
    }
  }

  // 3. Sort by timestamp descending (newest first)
  return policies.sort((a, b) => b.timestamp - a.timestamp);
};
