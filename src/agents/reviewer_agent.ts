import { MCP } from '../mcp.js';
import { TaskDefinition } from '../daemon/task_definitions.js';
import { PersonaMiddleware } from '../persona/middleware.js';

export class ReviewerAgent {
  private mcp: MCP;
  private persona: PersonaMiddleware;

  constructor() {
    this.mcp = new MCP();
    this.persona = new PersonaMiddleware();
  }

  async reviewTask(task: TaskDefinition, artifacts: string[] = []): Promise<{ approved: boolean; feedback: string }> {
    // Init Brain
    try {
        await this.mcp.init();
        const servers = this.mcp.listServers();
        if (servers.find((s) => s.name === "brain" && s.status === "stopped")) {
            await this.mcp.startServer("brain");
        }
    } catch (e) {
        console.warn("[ReviewerAgent] Failed to connect to Brain MCP:", e);
    }

    console.log(`[ReviewerAgent] Reviewing task: ${task.name}`);

    // Simulate review logic
    // In a real implementation, this would read the artifacts and use an LLM to review them.
    // For now, we simulate a successful review if artifacts are present, or pending if not.

    let approved = true;
    let rawFeedback = "Automated review passed.";

    if (artifacts.length === 0) {
        // feedback = "No artifacts produced to review.";
        // approved = true; // Non-blocking for now
    }

    // Apply persona to feedback
    const feedback = await this.persona.transform(rawFeedback, undefined, 'response', false);

    // Log the review experience
    try {
        const client = this.mcp.getClient("brain");
        if (client) {
            await client.callTool({
                name: "log_experience",
                arguments: {
                    taskId: `review-${task.id}-${Date.now()}`,
                    task_type: "review",
                    agent_used: "reviewer-agent",
                    outcome: approved ? "approved" : "rejected",
                    summary: `Reviewed task ${task.id}. Feedback: ${feedback}`,
                    company: task.company,
                    artifacts: JSON.stringify(artifacts)
                }
            });
            console.log("[ReviewerAgent] Logged review experience to Brain.");
        }
    } catch (e) {
        console.warn("[ReviewerAgent] Failed to log review experience:", e);
    }

    return { approved, feedback };
  }
}
