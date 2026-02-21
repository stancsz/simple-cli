import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import express from "express";
import { fileURLToPath } from "url";
import process from "process";

export class GeminiServer {
  private server: McpServer;
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor() {
    this.server = new McpServer({
      name: "gemini",
      version: "1.0.0",
    });

    this.apiKey = process.env.GOOGLE_API_KEY || "";
    this.genAI = new GoogleGenerativeAI(this.apiKey);

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "gemini_generate_content",
      "Generate content using Google Gemini models.",
      {
        model_name: z.enum(["gemini-1.5-pro", "gemini-1.5-flash"]).default("gemini-1.5-flash").describe("The model to use."),
        prompt: z.string().describe("The prompt to generate content from."),
        system_instruction: z.string().optional().describe("Optional system instruction."),
        max_output_tokens: z.number().optional().describe("Max output tokens."),
        temperature: z.number().optional().describe("Temperature for generation."),
      },
      async ({ model_name, prompt, system_instruction, max_output_tokens, temperature }) => {
        if (!this.apiKey) {
          return {
            content: [{ type: "text", text: "Error: GOOGLE_API_KEY is not set." }],
            isError: true
          };
        }

        try {
          const modelParams: any = { model: model_name };
          if (system_instruction) {
             modelParams.systemInstruction = system_instruction;
          }

          const model = this.genAI.getGenerativeModel(modelParams);

          const generationConfig: any = {};
          if (max_output_tokens) generationConfig.maxOutputTokens = max_output_tokens;
          if (temperature !== undefined) generationConfig.temperature = temperature;

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig
          });

          const response = await result.response;
          const text = response.text();

          return {
            content: [{ type: "text", text: text }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Gemini API Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "gemini_chat",
      "Chat with Google Gemini (stateless wrapper, pass history if needed).",
      {
        model_name: z.enum(["gemini-1.5-pro", "gemini-1.5-flash"]).default("gemini-1.5-flash"),
        message: z.string().describe("The new message to send."),
        history: z.array(
          z.object({
            role: z.enum(["user", "model"]),
            parts: z.array(z.object({ text: z.string() }))
          })
        ).optional().describe("Chat history."),
        system_instruction: z.string().optional(),
      },
      async ({ model_name, message, history, system_instruction }) => {
        if (!this.apiKey) {
           return { content: [{ type: "text", text: "Error: GOOGLE_API_KEY is not set." }], isError: true };
        }

        try {
          const modelParams: any = { model: model_name };
          if (system_instruction) modelParams.systemInstruction = system_instruction;

          const model = this.genAI.getGenerativeModel(modelParams);

          const chat = model.startChat({
            history: history || [],
          });

          const result = await chat.sendMessage(message);
          const response = await result.response;
          const text = response.text();

          return {
            content: [{ type: "text", text: text }],
          };
        } catch (e: any) {
           return { content: [{ type: "text", text: `Gemini Chat Error: ${e.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
        "gemini_stream_content",
        "Stream content generation (returns full text, but uses streaming API internally to verify functionality).",
        {
          model_name: z.enum(["gemini-1.5-pro", "gemini-1.5-flash"]).default("gemini-1.5-flash"),
          prompt: z.string(),
        },
        async ({ model_name, prompt }) => {
            if (!this.apiKey) return { content: [{ type: "text", text: "Error: GOOGLE_API_KEY is not set." }], isError: true };

            try {
                const model = this.genAI.getGenerativeModel({ model: model_name });
                const result = await model.generateContentStream(prompt);

                let fullText = "";
                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    fullText += chunkText;
                }

                return {
                    content: [{ type: "text", text: fullText }]
                };
            } catch (e: any) {
                return { content: [{ type: "text", text: `Gemini Stream Error: ${e.message}` }], isError: true };
            }
        }
    );
  }

  async run() {
    if (process.env.PORT) {
        const app = express();
        const transport = new StreamableHTTPServerTransport();
        await this.server.connect(transport);

        app.all("/sse", async (req, res) => {
            await transport.handleRequest(req, res);
        });

        app.post("/messages", async (req, res) => {
            await transport.handleRequest(req, res);
        });

        app.get("/health", (req, res) => {
            res.sendStatus(200);
        });

        const port = process.env.PORT;
        app.listen(port, () => {
            console.error(`Gemini MCP Server running on http://localhost:${port}/sse`);
        });
    } else {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Gemini MCP Server running on stdio");
    }
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new GeminiServer();
  server.run().catch((err) => {
    console.error("Fatal error in Gemini MCP Server:", err);
    process.exit(1);
  });
}
