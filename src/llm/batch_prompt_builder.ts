import { jsonrepair } from "jsonrepair";

export interface BatchTaskInput {
    id: string;
    prompt: string;
}

export interface BatchTaskResult {
    id: string;
    thought?: string;
    tool?: string;
    args?: any;
    message?: string;
    status: 'success' | 'failed';
    error?: string;
}

export class BatchPromptBuilder {
    static buildPrompt(tasks: BatchTaskInput[], baseSystemPrompt: string): string {
        let metaPrompt = baseSystemPrompt + "\n\n";
        metaPrompt += "=================================================================\n";
        metaPrompt += "BATCH TASK INSTRUCTIONS\n";
        metaPrompt += "=================================================================\n";
        metaPrompt += "You are processing a batch of independent tasks. You must execute EACH task independently.\n";
        metaPrompt += "Your output MUST be a JSON array containing EXACTLY ONE object per task in the batch.\n";
        metaPrompt += "Each object MUST correspond to the task's ID and have the following structure:\n";
        metaPrompt += "{\n";
        metaPrompt += '  "id": "task-id",\n';
        metaPrompt += '  "thought": "Your reasoning for this specific task",\n';
        metaPrompt += '  "tool": "tool_name_or_none",\n';
        metaPrompt += '  "args": { "tool_args": "here" },\n';
        metaPrompt += '  "message": "Any message to the user"\n';
        metaPrompt += "}\n\n";
        metaPrompt += "Here are the tasks to process:\n\n";

        tasks.forEach((t, i) => {
            metaPrompt += `--- TASK ${i + 1} ---\n`;
            metaPrompt += `ID: ${t.id}\n`;
            metaPrompt += `PROMPT: ${t.prompt}\n\n`;
        });

        metaPrompt += "Respond ONLY with the JSON array.\n";
        return metaPrompt;
    }

    static parseResponse(rawResponse: string, taskIds: string[]): BatchTaskResult[] {
        const results: BatchTaskResult[] = [];
        const rawTrimmed = rawResponse.trim();
        let parsedArray: any[] = [];

        try {
            // Find the array block
            const match = rawTrimmed.match(/\[\s*\{[\s\S]*\}\s*\]/);
            const jsonStr = match ? match[0] : rawTrimmed;
            const repaired = jsonrepair(jsonStr);
            parsedArray = JSON.parse(repaired);

            if (!Array.isArray(parsedArray)) {
                // If the LLM returned a single object instead of an array
                if (parsedArray && typeof parsedArray === 'object' && (parsedArray as any).id) {
                     parsedArray = [parsedArray];
                } else {
                     throw new Error("Response is not a JSON array.");
                }
            }
        } catch (e: any) {
            console.warn(`[BatchPromptBuilder] Failed to parse batch response: ${e.message}`);
            // Fallback: Return failure for all requested tasks
            return taskIds.map(id => ({
                id,
                status: 'failed',
                error: `Failed to parse LLM response: ${e.message}`
            }));
        }

        // Map parsed results to the requested IDs
        for (const id of taskIds) {
            const parsedObj = parsedArray.find(item => item.id === id);

            if (parsedObj) {
                results.push({
                    id,
                    thought: parsedObj.thought,
                    tool: parsedObj.tool,
                    args: parsedObj.args || {},
                    message: parsedObj.message,
                    status: 'success'
                });
            } else {
                results.push({
                    id,
                    status: 'failed',
                    error: "Task ID missing from LLM response."
                });
            }
        }

        return results;
    }
}
