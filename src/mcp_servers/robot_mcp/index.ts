import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "robot-mcp-so-arm100",
  version: "1.0.0",
});

interface RobotState {
  x: number;
  y: number;
  z: number;
  joints: number[]; // 5 DOF
}

const state: RobotState = {
  x: 100,
  y: 0,
  z: 100,
  joints: [0, 90, -90, 0, 0],
};

// Mock Inverse Kinematics
function calculateIK(x: number, y: number, z: number): number[] {
  // This is a placeholder for actual IK logic for SO-ARM100
  // It just returns some dummy angles based on coordinates
  const base = Math.atan2(y, x) * (180 / Math.PI);
  const reach = Math.sqrt(x*x + y*y);
  const shoulder = Math.atan2(z, reach) * (180 / Math.PI);

  return [base, shoulder, -shoulder, 0, 0];
}

server.tool(
  "move_to_coordinate",
  "Move the robot end-effector to specific Cartesian coordinates using Inverse Kinematics.",
  {
    x: z.number().describe("X coordinate (mm)"),
    y: z.number().describe("Y coordinate (mm)"),
    z: z.number().describe("Z coordinate (mm)"),
  },
  async ({ x, y, z }) => {
    // Check workspace limits (simple box)
    if (x < 0 || x > 300 || z < 0 || z > 300) {
        return {
            isError: true,
            content: [{ type: "text", text: "Error: Coordinates out of workspace range." }]
        };
    }

    const targetJoints = calculateIK(x, y, z);

    // Simulate movement
    await new Promise(resolve => setTimeout(resolve, 500));

    state.x = x;
    state.y = y;
    state.z = z;
    state.joints = targetJoints;

    return {
      content: [
        {
          type: "text",
          text: `Moved to [${x}, ${y}, ${z}].\nCalculated Joints: [${targetJoints.map(j => j.toFixed(1)).join(", ")}]`,
        },
      ],
    };
  }
);

server.tool(
  "get_status",
  "Get the current robot position and joint angles.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Robot MCP (SO-ARM100) running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
