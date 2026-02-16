import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "phosphobot-mcp",
  version: "1.0.0",
});

interface PhosphobotState {
  objects_detected: Array<{ id: string; type: string; confidence: number; location: number[] }>;
  status: "idle" | "moving" | "picking";
}

const state: PhosphobotState = {
  objects_detected: [
    { id: "obj_1", type: "red_block", confidence: 0.95, location: [0.2, 0.1, 0.05] },
    { id: "obj_2", type: "blue_cylinder", confidence: 0.88, location: [-0.1, 0.3, 0.05] },
  ],
  status: "idle",
};

server.tool(
  "get_camera_frame",
  "Get the current camera frame from the robot. Returns a mock base64 image and detected objects metadata.",
  {},
  async () => {
    // Return a mock base64 image (1x1 pixel black png)
    const mockImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    return {
      content: [
        {
          type: "text",
          text: `Camera Frame Captured. Detected Objects: ${JSON.stringify(state.objects_detected)}`,
        },
        {
          type: "image",
          data: mockImage,
          mimeType: "image/png",
        }
      ],
    };
  }
);

server.tool(
  "pickup_object",
  "Pick up an object at a specific location.",
  {
    object_id: z.string().describe("ID of the object to pick up"),
    location: z.array(z.number()).length(3).describe("Coordinates [x, y, z] of the object"),
  },
  async ({ object_id, location }) => {
    if (state.status !== "idle") {
        return {
            isError: true,
            content: [{ type: "text", text: `Error: Robot is busy (${state.status})` }]
        };
    }

    state.status = "picking";

    // Simulate action
    await new Promise(resolve => setTimeout(resolve, 1000));

    state.status = "idle";
    // Remove object from detected list if successful
    const idx = state.objects_detected.findIndex(o => o.id === object_id);
    if (idx > -1) state.objects_detected.splice(idx, 1);

    return {
      content: [
        {
          type: "text",
          text: `Successfully picked up object '${object_id}' at [${location.join(", ")}].`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Phosphobot MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
