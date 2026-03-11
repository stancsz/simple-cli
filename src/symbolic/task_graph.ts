export type TaskNodeType = 'tool_call' | 'condition' | 'data_transform';

export interface BaseTaskNode {
    id: string;
    type: TaskNodeType;
    next?: string | Record<string, string>; // ID of next node, or map of branch -> node ID
}

export interface ToolCallNode extends BaseTaskNode {
    type: 'tool_call';
    serverName?: string;
    toolName: string;
    argumentsTemplate: Record<string, any>; // Support simple templates like {{context.deal_amount}}
    resultKey?: string; // Where to store the result in context
}

export interface ConditionNode extends BaseTaskNode {
    type: 'condition';
    condition: string; // The rule expression (e.g., "deal_amount > 10000")
    next: {
        true: string;
        false: string;
    };
}

export interface DataTransformNode extends BaseTaskNode {
    type: 'data_transform';
    transform: string; // E.g., a simple JSONPath or mapping rule
    inputKey: string;
    outputKey: string;
}

export type TaskNode = ToolCallNode | ConditionNode | DataTransformNode;

export interface TaskGraph {
    id: string;
    name: string;
    description: string;
    trigger_intent: string; // A description/pattern of the prompt that triggers this graph
    startNode: string;
    nodes: Record<string, TaskNode>;
    contextVariables: string[]; // Variables expected to be initialized before running
}
