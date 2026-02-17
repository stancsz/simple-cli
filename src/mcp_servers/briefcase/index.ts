import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { CompanyManager } from "../../briefcase/manager.js";

export class BriefcaseServer {
  private server: McpServer;
  private manager: CompanyManager | null = null;

  constructor() {
    this.server = new McpServer({
      name: "briefcase",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private async getManager() {
    if (!this.manager) {
      const companyId = process.env.JULES_COMPANY;
      if (!companyId) {
          throw new Error("No company context loaded. Set JULES_COMPANY environment variable.");
      }
      this.manager = new CompanyManager(companyId);
      await this.manager.load();
    }
    return this.manager;
  }

  private setupTools() {
    this.server.tool(
      "briefcase_get_context",
      "Get the current company's context (brand voice, relevant docs) based on a query.",
      {
        query: z.string().optional().describe("Query to find relevant company documents."),
      },
      async ({ query }) => {
        try {
          const manager = await this.getManager();
          const context = await manager.getContext(query || "");
          return {
            content: [{ type: "text", text: context }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error retrieving context: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "briefcase_add_document",
      "Add a document to the company's knowledge base.",
      {
        title: z.string().describe("The title or filename of the document."),
        content: z.string().describe("The text content of the document."),
      },
      async ({ title, content }) => {
        try {
          const manager = await this.getManager();
          await manager.addDocument(title, content);
          return {
            content: [{ type: "text", text: `Document '${title}' added successfully.` }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error adding document: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "briefcase_update_profile",
      "Update the company profile (e.g., brand voice).",
      {
        updates: z.string().describe("JSON string containing fields to update (e.g., brandVoice)."),
      },
      async ({ updates }) => {
        try {
          const manager = await this.getManager();
          const parsed = JSON.parse(updates);
          await manager.updateProfile(parsed);
          return {
            content: [{ type: "text", text: "Profile updated successfully." }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error updating profile: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "briefcase_list_documents",
      "List all available documents in the company context.",
      {},
      async () => {
        try {
          const manager = await this.getManager();
          const docs = await manager.listDocuments();
          return {
            content: [{ type: "text", text: docs.length > 0 ? docs.join("\n") : "No documents found." }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error listing documents: ${e.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Briefcase MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new BriefcaseServer();
  server.run().catch((err) => {
    console.error("Fatal error in Briefcase MCP Server:", err);
    process.exit(1);
  });
}
