import { WorkflowRegistry } from "./workflows.js";

export class EscalationManager {
  constructor(private registry: WorkflowRegistry) {}

  async escalate(workflowId: string, reason: string) {
    const wf = await this.registry.get(workflowId);
    if (!wf) throw new Error(`Workflow ${workflowId} not found`);

    if (wf.status === 'escalated') {
        return { success: true, message: "Workflow already escalated." };
    }

    await this.registry.updateStatus(workflowId, 'escalated', `ESCALATION: ${reason}`);

    // Simulate notification
    console.error(`[ESCALATION] Alert for client ${wf.client}, workflow ${wf.type}: ${reason}`);
    // In production, this would send an email/Slack message

    return { success: true, message: "Escalation triggered and logged." };
  }
}
