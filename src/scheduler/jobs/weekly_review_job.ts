import "dotenv/config";
import { MCP } from "../../mcp.js";
import { TaskDefinition } from "../../daemon/task_definitions.js";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from 'url';

export async function runWeeklyReview(taskDef: TaskDefinition) {
  const yoloMode = taskDef.yoloMode === true;
  console.log(`Starting Weekly Review (YOLO: ${yoloMode})`);

  const mcp = new MCP();
  await mcp.init();

  // Start necessary servers
  const servers = ["hr", "brain"];
  if (yoloMode) servers.push("core_updater");

  for (const server of servers) {
    try {
      if (!mcp.isServerRunning(server)) {
        await mcp.startServer(server);
      }
    } catch (e: any) {
      console.error(`Failed to start server ${server}: ${e.message}`);
      // Proceed if non-critical? HR is critical.
      if (server === "hr") throw new Error(`Critical server ${server} failed to start.`);
    }
  }

  // Get HR client
  const hr = mcp.getClient("hr");
  if (!hr) {
      throw new Error("HR client not available.");
  }

  console.log("Calling perform_weekly_review...");
  let reviewResult: any;
  try {
      reviewResult = await hr.callTool({ name: "perform_weekly_review", arguments: {} });
  } catch (e: any) {
      throw new Error(`perform_weekly_review failed: ${e.message}`);
  }

  const outputText = reviewResult.content?.[0]?.text || "";
  console.log("Review Output:\n", outputText);

  // Parse Proposal
  const jsonBlockRegex = /```json_proposal\s*([\s\S]*?)\s*```/;
  const match = outputText.match(jsonBlockRegex);

  if (match && match[1]) {
      try {
          const proposal = JSON.parse(match[1]);
          console.log("Found structured proposal:", proposal.title);

          if (yoloMode && proposal.changes && proposal.changes.length > 0) {
              await applyCoreUpdate(mcp, proposal, taskDef);
          } else if (yoloMode) {
              console.log("YOLO mode enabled but no structured changes found in proposal.");
          } else {
              console.log("YOLO mode disabled. Proposal pending manual review.");
          }

      } catch (e) {
          console.error("Failed to parse proposal JSON:", e);
      }
  } else {
      console.log("No structured proposal found in output.");
  }

  // Log completion
  await logExperience(mcp, taskDef, "success", "Weekly review completed.");
}

async function applyCoreUpdate(mcp: MCP, proposal: any, taskDef: TaskDefinition) {
    console.log("Attempting to apply core update...");
    const core = mcp.getClient("core_updater");
    if (!core) {
        console.error("Core Updater client not available.");
        return;
    }

    try {
        // 1. Propose Update
        console.log("Proposing update...");
        const proposeResult: any = await core.callTool({
            name: "propose_core_update",
            arguments: {
                title: proposal.title,
                description: proposal.description,
                changes: proposal.changes
            }
        });

        const proposeText = proposeResult.content?.[0]?.text || "";
        console.log("Propose Result:", proposeText);

        // 2. Parse Token
        // "ID: uuid\nRisk Level: low\nApproval Token: token"
        const idMatch = proposeText.match(/ID:\s*([\w-]+)/);
        const tokenMatch = proposeText.match(/Approval Token:\s*([\w-]+)/);

        if (idMatch && tokenMatch) {
            const updateId = idMatch[1];
            const token = tokenMatch[1];

            console.log(`Applying update ${updateId} with token...`);
            const applyResult: any = await core.callTool({
                name: "apply_core_update",
                arguments: {
                    update_id: updateId,
                    approval_token: token
                }
            });

            const applyText = applyResult.content?.[0]?.text || "";
            console.log("Apply Result:", applyText);

            if (applyText.includes("Applied Successfully")) {
                 await logExperience(mcp, taskDef, "success", `Applied core update: ${proposal.title}`);
            } else {
                 await logExperience(mcp, taskDef, "failed", `Failed to apply update: ${applyText}`);
            }

        } else {
            console.error("Failed to parse ID or Token from propose result.");
        }

    } catch (e: any) {
        console.error(`Error applying core update: ${e.message}`);
    }
}

async function logExperience(mcp: MCP, taskDef: TaskDefinition, outcome: string, summary: string) {
    const brain = mcp.getClient("brain");
    if (brain) {
        try {
            await brain.callTool({
                name: "log_experience",
                arguments: {
                    taskId: taskDef.id,
                    task_type: "weekly_review",
                    agent_used: "weekly_review_job",
                    outcome,
                    summary,
                    company: taskDef.company,
                    artifacts: JSON.stringify([])
                }
            });
        } catch (e) {
            console.warn("Failed to log experience:", e);
        }
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const taskDefStr = process.env.JULES_TASK_DEF;
  if (!taskDefStr) {
    console.error("No task definition provided (JULES_TASK_DEF).");
    process.exit(1);
  }

  let taskDef: TaskDefinition;
  try {
    taskDef = JSON.parse(taskDefStr);
  } catch (e) {
    console.error("Failed to parse JULES_TASK_DEF:", e);
    process.exit(1);
  }

  runWeeklyReview(taskDef).then(() => process.exit(0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}
