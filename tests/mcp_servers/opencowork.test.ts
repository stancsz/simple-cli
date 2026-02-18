import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { NegotiationManager } from '../../src/mcp_servers/opencowork/negotiation.js';
import { TeamFormation } from '../../src/mcp_servers/opencowork/types.js';

describe('OpenCowork Negotiation', async () => {
    // Mock MCP class
    const callToolMock = mock.fn(async () => { return { content: [] }; });
    const mcpMock = {
        getClient: mock.fn((name) => {
            if (name === 'brain') {
                return {
                    callTool: callToolMock
                };
            }
            return undefined;
        })
    };

    const negotiation = new NegotiationManager(mcpMock as any);

    it('should submit a bid', async () => {
        const bid = {
            taskId: 'task-1',
            agentName: 'Coder',
            proposal: 'I can code it',
            estimatedTime: '2h',
            cost: 100,
            confidenceScore: 0.9
        };
        const result = await negotiation.submitBid(bid);
        assert.strictEqual(result.status, 'submitted');
        assert.strictEqual(result.bidId, 'task-1-Coder');

        const bids = negotiation.getBids('task-1');
        assert.strictEqual(bids.length, 1);
        assert.deepStrictEqual(bids[0], bid);
    });

    it('should evaluate bids correctly', async () => {
        const bid1 = {
            taskId: 'task-2',
            agentName: 'AgentA',
            proposal: '...',
            estimatedTime: '1h',
            cost: 200,
            confidenceScore: 0.8
        };
        const bid2 = {
            taskId: 'task-2',
            agentName: 'AgentB',
            proposal: '...',
            estimatedTime: '2h',
            cost: 150,
            confidenceScore: 0.9
        };

        await negotiation.submitBid(bid1);
        await negotiation.submitBid(bid2);

        const best = await negotiation.evaluateBids('task-2');
        assert.strictEqual(best?.agentName, 'AgentB'); // Higher confidence wins
    });

    it('should form a team and create a tree', async () => {
        const formation: TeamFormation = {
            teamName: 'DreamTeam',
            leadAgent: 'Lead',
            roles: [
                { role: 'coder', requiredSkills: ['ts'], count: 2 },
                { role: 'qa', requiredSkills: ['testing'], count: 1 }
            ],
            objective: 'Build website'
        };

        const tree = await negotiation.formTeam(formation);
        assert.ok(tree.id);
        assert.strictEqual(tree.root.agentName, 'Lead');
        assert.strictEqual(tree.root.children.length, 3); // 2 coders + 1 qa

        const coders = tree.root.children.filter(c => c.role === 'coder');
        assert.strictEqual(coders.length, 2);
    });

    it('should delegate task to a node', async () => {
         const formation: TeamFormation = {
            teamName: 'Team2',
            leadAgent: 'Lead2',
            roles: [{ role: 'worker', requiredSkills: [], count: 1 }],
            objective: 'Task'
        };
        const tree = await negotiation.formTeam(formation);
        const childName = tree.root.children[0].agentName;

        const result = await negotiation.delegate(tree.id, 'Lead2', childName, 'Do work');
        assert.strictEqual(result.status, 'delegated');

        const updatedTree = negotiation.getTeam(tree.id);
        const child = updatedTree?.root.children[0];
        assert.strictEqual(child?.status, 'working');
        assert.strictEqual(child?.task, 'Do work');
    });

    it('should handle integration scenario: Website Redesign', async () => {
        // Simulating "Website redesign" requiring Designer + Developer + Copywriter
        const formation: TeamFormation = {
            teamName: 'WebRedesignSquad',
            leadAgent: 'PM_Agent',
            roles: [
                { role: 'Designer', requiredSkills: ['figma'], count: 1 },
                { role: 'Developer', requiredSkills: ['react'], count: 2 },
                { role: 'Copywriter', requiredSkills: ['english'], count: 1 }
            ],
            objective: 'Redesign corporate website'
        };

        const tree = await negotiation.formTeam(formation);
        assert.strictEqual(tree.root.children.length, 4);

        // Verify Brain logging was called
        // Note: callToolMock is shared, so calls accumulate from previous tests too
        assert.ok(callToolMock.mock.calls.length >= 1);

        // Find the specific call for this test
        const calls = callToolMock.mock.calls;
        const lastCall = calls[calls.length - 1];
        const args = lastCall.arguments[0] as any;
        assert.strictEqual(args.name, 'log_experience');
        assert.strictEqual(args.arguments.task_type, 'team_formation');
        assert.ok(args.arguments.summary.includes('WebRedesignSquad'));
    });
});
