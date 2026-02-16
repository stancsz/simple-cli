import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Mock Robot State
interface RobotState {
  connected: boolean;
  ip: string | null;
  joints: number[]; // 6 joints in radians
  tcp_pose: number[]; // [x, y, z, rx, ry, rz] in meters/radians
}

const state: RobotState = {
  connected: false,
  ip: null,
  joints: [0, 0, 0, 0, 0, 0],
  tcp_pose: [0.5, 0, 0.5, 3.14, 0, 0], // Default home position
};

// Create server instance
const server = new McpServer({
  name: "universal-robot",
  version: "1.0.0",
});

// Helper to simulate movement delay
const simulateMovement = async (duration: number = 500) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
};

server.tool(
  "connect_robot",
  "Connect to a Universal Robot (UR3, UR5, UR10).",
  {
    ip: z.string().describe("IP address of the robot controller"),
  },
  async ({ ip }) => {
    state.connected = true;
    state.ip = ip;
    return {
      content: [
        {
          type: "text",
          text: `Successfully connected to Universal Robot at ${ip}`,
        },
      ],
    };
  }
);

server.tool(
  "move_robot_joints",
  "Move the robot arm to specific joint angles (in radians).",
  {
    joints: z.array(z.number()).length(6).describe("Array of 6 joint angles in radians"),
  },
  async ({ joints }) => {
    if (!state.connected) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: Robot not connected. Call connect_robot first." }],
      };
    }

    await simulateMovement();
    state.joints = joints;
    // In a real implementation, forward kinematics would update tcp_pose here.
    // For now, we just update joints.

    return {
      content: [
        {
          type: "text",
          text: `Moved to joints: [${joints.map(j => j.toFixed(2)).join(", ")}]`,
        },
      ],
    };
  }
);

server.tool(
  "move_robot_linear",
  "Move the robot tool center point (TCP) linearly to a Cartesian pose.",
  {
    pose: z.array(z.number()).length(6).describe("Target pose [x, y, z, rx, ry, rz] (meters, radians)"),
  },
  async ({ pose }) => {
    if (!state.connected) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: Robot not connected. Call connect_robot first." }],
      };
    }

    await simulateMovement();
    state.tcp_pose = pose;
    // In a real implementation, inverse kinematics would update joints here.

    return {
      content: [
        {
          type: "text",
          text: `Moved to TCP pose: [${pose.map(v => v.toFixed(3)).join(", ")}]`,
        },
      ],
    };
  }
);

server.tool(
  "get_robot_status",
  "Get the current status of the robot, including connection state, joint angles, and TCP pose.",
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
  console.error("Universal Robot MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
