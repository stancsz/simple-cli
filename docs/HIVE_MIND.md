# The Hive Mind: Agent Negotiation and Delegation Protocols

## Overview
The Hive Mind functionality in OpenCowork enables true hierarchical swarms where agents can negotiate, bid on tasks, form dynamic teams, and manage delegation trees. This moves Simple CLI from a single-agent orchestrator to a multi-agent consulting firm.

## Protocols

### 1. Bidding System
Complex tasks are opened for bidding. Agents (or specialized personas) submit proposals with:
- **Proposal**: How they intend to solve the task.
- **Estimated Time**: Expected duration.
- **Cost**: Token cost or other metric.
- **Confidence Score**: Self-assessed probability of success (0-1).

The **Negotiation Manager** evaluates bids and selects the optimal agent based on confidence and cost.

#### Example Usage
```typescript
await client.callTool({
  name: "bid_on_task",
  arguments: {
    taskId: "task-123",
    agentName: "Senior-Dev-Agent",
    proposal: "I will use React and Tailwind to build the UI.",
    estimatedTime: "4h",
    cost: 500,
    confidenceScore: 0.95
  }
});

// Evaluate bids
await client.callTool({
  name: "evaluate_bids",
  arguments: {
    taskId: "task-123"
  }
});
```

### 2. Dynamic Team Formation
Lead agents can assemble teams based on objectives. This creates a **Delegation Tree** where the lead agent is the root, and required roles become child nodes.

The system consults the **Brain MCP** to recall past successful team compositions for similar objectives, optimizing the formation over time.

#### Example Usage
```typescript
await client.callTool({
  name: "form_agent_team",
  arguments: {
    teamName: "WebsiteRedesignSquad",
    leadAgent: "ProductManager",
    roles: [
      { role: "Designer", requiredSkills: ["figma"], count: 1 },
      { role: "FrontendDev", requiredSkills: ["react", "ts"], count: 2 },
      { role: "QA", requiredSkills: ["playwright"], count: 1 }
    ],
    objective: "Redesign corporate website"
  }
});
```

### 3. Delegation Trees
A hierarchical structure manages the workflow.
- **Root**: Lead Agent (PM, Architect).
- **Nodes**: Sub-agents (Dev, QA, Designer).
- **Leaves**: Atomic tasks.

The tree status is tracked, and tasks are delegated to specific nodes.

#### Example Usage
```typescript
await client.callTool({
  name: "negotiate_delegation",
  arguments: {
    treeId: "team-1700000000000",
    parentAgent: "ProductManager",
    childAgent: "FrontendDev-0",
    task: "Implement the landing page hero section."
  }
});
```

## Architecture
- **NegotiationManager**: Core logic in `src/mcp_servers/opencowork/negotiation.ts`.
- **Brain Integration**: Logs team formations and successes to `brain` MCP for learning.
- **OpenCowork Server**: Exposes tools and manages the lifecycle of local worker threads.

## Future Improvements
- **Live Bidding**: Allow agents to counter-offer.
- **Reputation System**: Track agent performance over time (implemented via Brain stats).
- **Resource Locking**: prevent agents from being over-committed.
