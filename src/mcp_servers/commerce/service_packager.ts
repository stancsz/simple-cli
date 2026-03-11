import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../llm.js";
import { EpisodicMemory } from "../../brain/episodic.js";

/**
 * Creates tiered service packages from existing agency capabilities.
 */
export async function servicePackagerLogic(params: {
  target_industry?: string;
  desired_margin?: number;
}): Promise<any> {
  const { target_industry, desired_margin } = params;

  // Utilize EpisodicMemory to recall past successful delivery patterns and services
  const memory = new EpisodicMemory();
  await memory.init();
  const successfulProjects = await memory.recall("successful project delivery and client satisfaction");

  const llm = createLLM();
  const prompt = `
    Analyze the following successful projects and the given constraints to design new, tiered service packages.
    Target Industry: ${target_industry || "Any"}
    Desired Margin: ${desired_margin ? `${desired_margin * 100}%` : "Standard"}
    Past Successful Projects Context: ${JSON.stringify(successfulProjects.slice(0, 3))}

    Return ONLY a JSON array of service packages containing:
    - package_name: The name of the package
    - tier: e.g., 'Basic', 'Pro', 'Enterprise'
    - price: Recommended listing price
    - deliverables: An array of what the client receives
    - estimated_delivery_time: In days
  `;

  try {
    const response = await llm.generate("You are a service packaging agent.", [{ role: "user", content: prompt }]);
    let parsedResponse;
    try {
        const cleanedText = (response.message || "").replace(/```json\n?|\n?```/g, "").trim();
        parsedResponse = JSON.parse(cleanedText);
    } catch (e) {
        parsedResponse = [{ package_name: "Standard Pack", tier: "Basic", price: 1000, deliverables: [], estimated_delivery_time: 14 }];
    }

    return parsedResponse;
  } catch (error) {
    console.error("Error in service packager:", error);
    throw new Error(`Failed to generate service packages: ${error}`);
  }
}

/**
 * Registers the service packager tool with the provided MCP server.
 */
export function registerServicePackagerTools(server: McpServer) {
  server.tool(
    "service_packager",
    "Analyzes past successful projects and capabilities to create tiered service offerings.",
    {
      target_industry: z.string().optional().describe("The industry to tailor the packages for."),
      desired_margin: z.number().optional().describe("The target profit margin percentage (e.g., 0.4 for 40%)."),
    },
    async (params) => {
      try {
        const result = await servicePackagerLogic(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error during service packaging: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
