import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AgencyProfile, TaskDelegationRequest, TaskDelegationResponse } from "./protocol.js";

// Utility to manage federation directory
const getFederationDir = (): string => {
  const agentDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), ".agent");
  const federationDir = path.join(agentDir, "federation");
  if (!fs.existsSync(federationDir)) {
    fs.mkdirSync(federationDir, { recursive: true });
  }
  return federationDir;
};

const getAgenciesFile = (): string => {
  return path.join(getFederationDir(), "agencies.json");
};

// Tool: Register Agency
export const registerAgency = async (profile: AgencyProfile): Promise<{ success: boolean; message: string }> => {
  try {
    const file = getAgenciesFile();
    let agencies: Record<string, AgencyProfile> = {};

    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, "utf8");
      if (data) {
        agencies = JSON.parse(data);
      }
    }

    agencies[profile.agency_id] = profile;
    fs.writeFileSync(file, JSON.stringify(agencies, null, 2), "utf8");

    return { success: true, message: `Agency '${profile.agency_id}' successfully registered.` };
  } catch (err: any) {
    return { success: false, message: `Failed to register agency: ${err.message}` };
  }
};

// Tool: Discover Agencies
export const discoverAgencies = async (capability_required?: string): Promise<AgencyProfile[]> => {
  try {
    const file = getAgenciesFile();
    if (!fs.existsSync(file)) {
      return [];
    }

    const data = fs.readFileSync(file, "utf8");
    if (!data) return [];

    const agencies: Record<string, AgencyProfile> = JSON.parse(data);
    const allProfiles = Object.values(agencies);

    if (capability_required) {
      return allProfiles.filter(p =>
        p.status === "active" &&
        p.capabilities.some(c => c.name === capability_required)
      );
    }

    return allProfiles.filter(p => p.status === "active");
  } catch (err: any) {
    console.error(`Error discovering agencies: ${err.message}`);
    return [];
  }
};

// Tool: Delegate Task
export const delegateTask = async (request: TaskDelegationRequest, api_key?: string): Promise<TaskDelegationResponse> => {
  try {
    // Phase 31: Wrap the existing `swarm.negotiate_task` to route to an external agency
    // We instantiate the Swarm MCP Server locally to evaluate task complexity or simulate the Swarm
    // before physically routing it over HTTP.

    // Attempt dynamic import to avoid circular dependency issues
    const { SwarmServer } = await import("../swarm/index.js");
    const swarmServer = new SwarmServer();

    // Let swarm orchestrator optionally analyze the request (simulation mode = true)
    // This connects Federation Protocol with the core Swarm Intelligence.
    try {
        await swarmServer.negotiateTask([], request.task_description, true);
    } catch (e) {
        console.warn("[Federation] Failed to run pre-delegation swarm negotiation:", e);
    }

    const file = getAgenciesFile();
    if (!fs.existsSync(file)) {
      throw new Error("No agencies registered in federation directory.");
    }

    const data = fs.readFileSync(file, "utf8");
    const agencies: Record<string, AgencyProfile> = JSON.parse(data);

    const targetAgency = agencies[request.agency_id];
    if (!targetAgency) {
      return {
        task_id: request.task_id,
        status: "failed",
        error: `Agency '${request.agency_id}' not found.`
      };
    }

    if (targetAgency.status !== "active") {
        return {
            task_id: request.task_id,
            status: "rejected",
            error: `Agency '${request.agency_id}' is not active (status: ${targetAgency.status}).`
        };
    }

    // Prepare headers for RPC call
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Simplistic auth token approach for the prototype
    if (api_key) {
      headers["Authorization"] = `Bearer ${api_key}`;
    }

    // Compute simple HMAC signature if a secret is provided
    const secret = process.env.FEDERATION_SECRET || process.env.OPENAI_API_KEY || "default-secret";
    const payloadStr = JSON.stringify(request);
    const signature = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
    headers["X-Federation-Signature"] = signature;

    // Execute HTTP POST to the target agency's endpoint
    // In our test environment, we might hit localhost or a mock server
    const rpcUrl = new URL("/mcp/delegate", targetAgency.endpoint).toString();

    console.log(`Delegating task to ${rpcUrl}...`);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: payloadStr
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        task_id: request.task_id,
        status: "failed",
        error: `HTTP ${response.status}: ${errorText || response.statusText}`
      };
    }

    const responseData = await response.json();

    // Ensure the response conforms to TaskDelegationResponse
    return {
      task_id: responseData.task_id || request.task_id,
      status: responseData.status || "completed",
      result: responseData.result,
      error: responseData.error
    };

  } catch (err: any) {
    return {
      task_id: request.task_id,
      status: "failed",
      error: `Delegation failed: ${err.message}`
    };
  }
};
