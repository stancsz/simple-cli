import { LLM } from "./llm.js";
import { MCP } from "./mcp.js";
import { join } from "path";
import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import pc from "picocolors";
import { logMetric } from "./logger.js";

export class Supervisor {
  constructor(private llm: LLM, private mcp: MCP) {}

  async verify(
    result: any,
    toolName: string,
    toolArgs: any,
    userRequest: string,
    history: any[],
    signal?: AbortSignal,
    company?: string
  ): Promise<{ verified: boolean; feedback?: string; thought?: string }> {

    // --- Visual Quality Gate Check ---
    const isVisualTool = ["take_screenshot", "generate_image"].includes(toolName);
    const hasImageArtifact = result && result.content && Array.isArray(result.content) && result.content.some((c: any) => c.type === "image");

    // Check for visual intent in user request
    const visualKeywords = ["design", "ui", "ux", "style", "css", "layout", "color", "font", "aesthetic", "visual", "mockup", "screenshot", "page"];
    const isVisualIntent = visualKeywords.some(k => userRequest.toLowerCase().includes(k));

    if ((isVisualTool || hasImageArtifact) && isVisualIntent) {
        console.log(pc.cyan(`[Supervisor] Visual task detected. Engaging Visual Quality Gate...`));

        let screenshotPath: string | null = null;
        let htmlContent: string | undefined = undefined;

        // Extract HTML if available (from write_file)
        if (toolName === "write_file" && toolArgs && toolArgs.path && toolArgs.path.endsWith(".html")) {
             htmlContent = toolArgs.content;
        }

        // If htmlContent is not found from current tool, try to find it in history
        if (!htmlContent) {
            // Iterate backwards
            for (let i = history.length - 1; i >= 0; i--) {
                const msg = history[i];
                if (msg.role === "assistant") {
                    try {
                        // Check if message content is JSON (tool execution log)
                        // It might be raw text if LLM response, but orchestrator logs tool exec as JSON
                        if (msg.content.trim().startsWith("{")) {
                            const content = JSON.parse(msg.content);
                            if (content.tool === "write_file" && content.args && content.args.path && content.args.path.endsWith(".html")) {
                                htmlContent = content.args.content;
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // Extract screenshot
        if (hasImageArtifact) {
            const imageContent = result.content.find((c: any) => c.type === "image");
            if (imageContent && imageContent.data) {
                // Save base64 to temp file
                const tempDir = join(tmpdir(), "jules-visual-gate");
                if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true });

                const ext = imageContent.mimeType === "image/png" ? "png" : "jpg";
                screenshotPath = join(tempDir, `${randomUUID()}.${ext}`);
                await writeFile(screenshotPath, Buffer.from(imageContent.data, "base64"));
            }
        } else if (result && result.content && result.content[0] && result.content[0].text) {
             // Maybe the result is a path to a screenshot?
             const text = result.content[0].text;
             if (text.match(/\.(png|jpg|jpeg)$/i) && existsSync(text.trim())) {
                 screenshotPath = text.trim();
             }
        }

        if (screenshotPath) {
            try {
                const gateClient = this.mcp.getClient("visual_quality_gate");
                if (gateClient) {
                    const gateResult: any = await gateClient.callTool({
                        name: "assess_design_quality",
                        arguments: {
                            screenshot_path: screenshotPath,
                            company_id: company,
                            context: userRequest,
                            html_content: htmlContent
                        }
                    });

                    if (gateResult && gateResult.content && gateResult.content[0] && gateResult.content[0].text) {
                        const gateResponse = JSON.parse(gateResult.content[0].text);

                        console.log(pc.cyan(`[Supervisor] Visual Quality Score: ${gateResponse.score}/100`));

                        if (gateResponse.score < 70) {
                            const feedback = `Visual Quality Gate Failed (Score: ${gateResponse.score}).\nCritique:\n- ${gateResponse.critique.join("\n- ")}\nReasoning: ${gateResponse.reasoning}\n\nRecommendation: You should retry this task, potentially using a different desktop driver (e.g. 'avoid stagehand' or 'use skyvern') if the current one is not performing well.`;
                            logMetric("supervisor", "quality_gate_fail", 1, { company: company || "unknown" });
                            return { verified: false, feedback };
                        } else {
                            logMetric("supervisor", "quality_gate_pass", 1, { company: company || "unknown", score: gateResponse.score });
                            console.log(pc.green(`[Supervisor] Visual Quality Gate Passed.`));
                        }
                    }
                } else {
                    console.warn("[Supervisor] visual_quality_gate server not available. Skipping visual check.");
                }
            } catch (e) {
                console.error("[Supervisor] Visual Quality Gate error:", e);
            } finally {
                // Cleanup temp file
                if (typeof unlink === 'function') {
                    try {
                        await unlink(screenshotPath);
                    } catch {}
                }
            }
        }
    }

    // --- Standard LLM Verification ---
    const qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${userRequest}"? If specific files were mentioned (like flask app), check if they exist or look correct based on the tool output.`;

    const qaCheck = await this.llm.generate(
      qaPrompt,
      [...history, { role: "user", content: qaPrompt }],
      signal,
    );

    if (qaCheck.message && qaCheck.message.toLowerCase().includes("fail")) {
        return {
            verified: false,
            feedback: qaCheck.message || qaCheck.thought,
            thought: qaCheck.thought
        };
    }

    return { verified: true, thought: qaCheck.thought };
  }
}
