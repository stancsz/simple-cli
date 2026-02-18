import { Bid, DelegationTree, TeamFormation, DelegationNode } from './types.js';
import { MCP } from '../../mcp.js';

export class NegotiationManager {
  private bids: Map<string, Bid[]> = new Map();
  private teams: Map<string, DelegationTree> = new Map();
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
  }

  async submitBid(bid: Bid) {
    if (!this.bids.has(bid.taskId)) {
      this.bids.set(bid.taskId, []);
    }
    this.bids.get(bid.taskId)!.push(bid);

    // Log bid activity (optional, but good for auditing)
    // We could use Brain here if we had a specific "audit log" tool.
    // For now, we keep it in memory.

    return { status: 'submitted', bidId: `${bid.taskId}-${bid.agentName}` };
  }

  getBids(taskId: string): Bid[] {
    return this.bids.get(taskId) || [];
  }

  async evaluateBids(taskId: string): Promise<Bid | null> {
      const bids = this.getBids(taskId);
      if (bids.length === 0) return null;

      // Simple evaluation: highest confidence, then lowest cost
      // Sort in descending order of preference
      bids.sort((a, b) => {
          if (b.confidenceScore !== a.confidenceScore) {
              return b.confidenceScore - a.confidenceScore; // Higher confidence first
          }
          return a.cost - b.cost; // Lower cost first
      });

      return bids[0];
  }

  async formTeam(formation: TeamFormation): Promise<DelegationTree> {
      // 1. Check Brain for past successful teams for similar objectives
      try {
          const brain = this.mcp.getClient('brain');
          if (brain) {
              // We could query 'recall_delegation_patterns' here to adjust the formation
              // based on past success. For now, we trust the lead agent's formation request.
              /*
              const history = await brain.callTool({
                  name: "recall_delegation_patterns",
                  arguments: { task_type: "team_formation", query: formation.objective }
              });
              */
          }
      } catch (e) {
          // Brain interaction is an enhancement, not a blocker
          // console.warn("Failed to consult brain for team formation:", e);
      }

      // 2. Create the tree
      const rootNode: DelegationNode = {
          agentName: formation.leadAgent,
          role: 'lead',
          children: [],
          status: 'idle'
      };

      for (const roleDef of formation.roles) {
          for (let i = 0; i < roleDef.count; i++) {
              const childNode: DelegationNode = {
                  agentName: `pending-${roleDef.role}-${i}`, // Placeholder until hired
                  role: roleDef.role,
                  children: [],
                  status: 'idle'
              };
              rootNode.children.push(childNode);
          }
      }

      const tree: DelegationTree = {
          id: `team-${Date.now()}`,
          root: rootNode,
          objective: formation.objective,
          status: 'active'
      };

      this.teams.set(tree.id, tree);

      // Log formation to Brain
      try {
          const brain = this.mcp.getClient('brain');
          if (brain) {
             await brain.callTool({
                 name: "log_experience",
                 arguments: {
                     taskId: tree.id,
                     task_type: "team_formation",
                     agent_used: formation.leadAgent,
                     outcome: "success",
                     summary: `Formed team '${formation.teamName}' for objective: ${formation.objective}`,
                     artifacts: JSON.stringify([])
                 }
             });
          }
      } catch (e) {
          // ignore
      }

      return tree;
  }

  getTeam(teamId: string): DelegationTree | undefined {
      return this.teams.get(teamId);
  }

  async delegate(treeId: string, parentAgent: string, childAgent: string, task: string) {
      const tree = this.teams.get(treeId);
      if (!tree) {
          throw new Error(`Team '${treeId}' not found.`);
      }

      // Find the parent node
      const findNode = (node: DelegationNode): DelegationNode | null => {
          if (node.agentName === parentAgent) return node;
          for (const child of node.children) {
              const found = findNode(child);
              if (found) return found;
          }
          return null;
      };

      const parentNode = findNode(tree.root);
      if (!parentNode) {
           // If parent is not in tree, maybe it's the root implicitly?
           // Or strictly enforce tree structure. Let's assume strict.
           throw new Error(`Parent agent '${parentAgent}' not found in team '${treeId}'.`);
      }

      // Check if child is a direct child of parent (or if we are dynamically adding)
      // The prompt implies "Delegation Trees: Implement a tree structure where parent agents can spawn and manage child agents".
      // So we might need to *add* the child if it doesn't exist, or find it.

      let childNode = parentNode.children.find(c => c.agentName === childAgent);

      if (!childNode) {
          // If child doesn't exist, maybe we update a pending placeholder?
          // Or we add a new child node if the parent is authorized to spawn.
          // Let's assume dynamic addition is allowed for flexibility.
          childNode = {
              agentName: childAgent,
              role: 'sub-agent', // simplified
              children: [],
              status: 'idle'
          };
          parentNode.children.push(childNode);
      }

      // Update status
      childNode.status = 'working';
      childNode.task = task;

      return {
          status: 'delegated',
          message: `Task delegated from ${parentAgent} to ${childAgent}.`
      };
  }

  updateNodeStatus(treeId: string, agentName: string, status: DelegationNode['status']) {
      const tree = this.teams.get(treeId);
      if (!tree) return;

      const findAndUpdate = (node: DelegationNode): boolean => {
          if (node.agentName === agentName) {
              node.status = status;
              return true;
          }
          for (const child of node.children) {
              if (findAndUpdate(child)) return true;
          }
          return false;
      };

      findAndUpdate(tree.root);
  }
}
