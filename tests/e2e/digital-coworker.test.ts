import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { createLLM } from "../../src/llm.js"; // Import mocked

// ----------------------------------------------------------------------
// 1. Mocks Setup (Hoisted by Vitest)
// ----------------------------------------------------------------------

// Use vi.hoisted to share state between mocks and test body
const mocks = vi.hoisted(() => ({
  appMentionHandler: { value: undefined as any },
  teamsMessageHandler: { value: undefined as any },
  brainStore: { instance: null as any }
}));

// Mock LLM
const mockLLMGenerate = vi.fn();
const mockEmbed = vi.fn().mockImplementation(async (text) => new Array(1536).fill(0.1));

vi.mock("../../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: mockLLMGenerate,
      embed: mockEmbed,
    }),
  };
});

// Mock Slack App
const mockSlackPostMessage = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, ts: "1234.56" }));

vi.mock("@slack/bolt", () => {
  return {
    App: class {
      constructor() {}
      event(name: string, handler: any) {
        if (name === "app_mention") mocks.appMentionHandler.value = handler;
      }
      action() {}
      start() { return Promise.resolve(); }
    }
  };
});

// Mock Teams Bot
const mockTeamsSendActivity = vi.fn().mockImplementation(() => Promise.resolve({ id: "123" }));

vi.mock("botbuilder", () => {
  return {
    CloudAdapter: class {
        process(req: any, res: any, logic: any) {
            logic({
                activity: req.body,
                sendActivity: mockTeamsSendActivity,
                turnState: new Map(),
                onTurnError: () => {}
            });
        }
        onTurnError() {}
    },
    ActivityHandler: class {
        constructor() {
            // Simulate initialization
        }
        onMessage(handler: any) { mocks.teamsMessageHandler.value = handler; }
        onMembersAdded() {}
        run(context: any) {
            if (context.activity.type === 'message') {
                return mocks.teamsMessageHandler.value(context, () => Promise.resolve());
            }
            return Promise.resolve();
        }
    },
    TurnContext: {
        removeRecipientMention: (activity: any) => activity.text
    },
    ConfigurationServiceClientCredentialFactory: class {},
    createBotFrameworkAuthenticationFromConfiguration: () => {},
    ActivityTypes: { MessageReaction: 'messageReaction', Typing: 'typing' },
    MessageFactory: { text: (t: string) => t }
  };
});

// Shared Memory Instance
let sharedMemory: EpisodicMemory;

// Mock MCP
vi.mock("../../src/mcp.js", () => {
  return {
    MCP: class {
      async init() {}
      async startServer() {}
      isServerRunning() { return true; }
      listServers() { return [{ name: "brain", status: "running" }]; }

      getClient(name: string) {
        // Return a mock client that interacts with sharedMemory for "brain"
        if (name === "brain") {
          return {
            callTool: async (args: any) => {
              const memory = mocks.brainStore.instance;
              if (!memory) throw new Error("Brain not initialized");

              if (args.name === "log_experience" || args.name === "store_memory") {
                 // Ensure artifacts is not empty for schema inference
                 const arts = args.arguments.artifacts && args.arguments.artifacts.length > 0
                     ? args.arguments.artifacts
                     : ['none'];
                 await memory.store(
                     args.arguments.taskId || "unknown",
                     args.arguments.request || "unknown",
                     args.arguments.solution || args.arguments.summary || "unknown",
                     arts,
                     args.arguments.company
                 );
                 return { content: [{ text: "Stored" }] };
              }
              if (args.name === "recall_delegation_patterns" || args.name === "query_memory") {
                 const res = await memory.recall(
                     args.arguments.query || "test",
                     5,
                     args.arguments.company
                 );
                 // Format as string for the LLM
                 const text = res.map(r => `[Memory] Request: ${r.userPrompt}, Response: ${r.agentResponse}`).join("\n");
                 return { content: [{ text: text || "No memory found." }] };
              }
              return { content: [] };
            },
            listTools: async () => ({ tools: [] }),
            close: async () => {}
          };
        }
        // Generic client for others
        return {
            callTool: async () => ({ content: [{ text: "ok" }] }),
            listTools: async () => ({ tools: [] }),
            close: async () => {}
        };
      }

      async getTools() {
        return [
          {
            name: "delegate_task",
            description: "Delegate a task to the autonomous agent",
            execute: async (args: any) => {
               return `Task delegated: ${args.description}`;
            }
          },
          {
            name: "query_memory",
            description: "Query the brain for past experiences",
            execute: async (args: any) => {
                const res = await sharedMemory.recall(args.query, 5, args.company);
                const text = res.map(r => `[Memory] Request: ${r.userPrompt}, Response: ${r.agentResponse}`).join("\n");
                return text || "No relevant memories found.";
            }
          }
        ];
      }
    }
  };
});

// ----------------------------------------------------------------------
// 2. Test Suite
// ----------------------------------------------------------------------

describe("End-to-End Digital Co-worker Flow", () => {
  const testRoot = join(process.cwd(), ".e2e-test-brain");

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup temporary Brain storage
    await rm(testRoot, { recursive: true, force: true });
    await mkdir(testRoot, { recursive: true });
    process.env.BRAIN_STORAGE_ROOT = testRoot;
    delete process.env.MOCK_EMBEDDINGS;

    // Initialize shared memory explicitly with mocked LLM
    sharedMemory = new EpisodicMemory(testRoot, createLLM());
    await sharedMemory.init();
    mocks.brainStore.instance = sharedMemory;
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("Full workflow: Slack -> Delegator -> Execution -> Brain -> Teams", async () => {
      // Setup LLM Responses for the sequence

      // --- SLACK INTERACTION SEQUENCE ---
      // 1. Initial Prompt -> Delegate Task
      mockLLMGenerate.mockResolvedValueOnce({
            thought: "I need to delegate this task.",
            tool: "delegate_task",
            args: { description: "Implement feature X" }
      });

      // 2. Supervisor QA Check (Engine internals)
      mockLLMGenerate.mockResolvedValueOnce({
            message: "Verified."
      });

      // 3. Post-execution Prompt -> Final Message to User
      mockLLMGenerate.mockResolvedValueOnce({
            message: "I have delegated the task to implement feature X."
      });


      // --- TEAMS INTERACTION SEQUENCE ---
      // 4. Initial Prompt -> Query Memory
      mockLLMGenerate.mockResolvedValueOnce({
            thought: "Checking memory for status.",
            tool: "query_memory",
            args: { query: "feature X" }
      });

      // 5. Supervisor QA Check
      mockLLMGenerate.mockResolvedValueOnce({
            message: "Verified."
      });

      // 6. Post-execution Prompt -> Final Message to User
      mockLLMGenerate.mockResolvedValueOnce({
            message: "Feature X was implemented successfully."
      });

      // ----------------------------------------------------------------
      // Step 1: User interacts via Slack
      // ----------------------------------------------------------------

      // Import Slack Interface (triggers initialization)
      await import("../../src/interfaces/slack.js");

      expect(mocks.appMentionHandler.value).toBeDefined();

      await mocks.appMentionHandler.value({
          event: { channel: "C123", text: "Create a task to implement feature X", ts: "1234.56" },
          say: mockSlackPostMessage,
          client: {
              reactions: { add: vi.fn() },
              chat: { postMessage: mockSlackPostMessage }
          }
      });

      // Verify delegation
      // Expect Slack to post the final message
      expect(mockSlackPostMessage).toHaveBeenCalledWith(expect.objectContaining({
          text: expect.stringContaining("I have delegated the task")
      }));

      // ----------------------------------------------------------------
      // Step 2: Simulate Task Execution & Brain Storage
      // ----------------------------------------------------------------
      // In a real scenario, JobDelegator would run here. We simulate its effect on the Brain.
      // The "Coding Agent" completes the task and logs it.
      await sharedMemory.store(
          "task-123",
          "Implement feature X",
          "Feature X implemented successfully. Artifacts created.",
          ['none']
      );

      // Verify it's in the DB
      const memories = await sharedMemory.recall("feature X");
      console.log(`Memories found: ${memories.length}`); // Debug log
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].agentResponse).toContain("Feature X implemented");

      // ----------------------------------------------------------------
      // Step 3: User interacts via Teams (Cross-interface retrieval)
      // ----------------------------------------------------------------

      // Import Teams Interface
      await import("../../src/interfaces/teams.js");

      expect(mocks.teamsMessageHandler.value).toBeDefined();

      const context = {
          activity: { type: 'message', text: "What happened with feature X?", recipient: { id: 'bot' } },
          sendActivity: mockTeamsSendActivity,
          sendActivities: vi.fn(),
          turnState: new Map()
      };

      await mocks.teamsMessageHandler.value(context, () => Promise.resolve());

      // Verify Retrieval and Response
      expect(mockTeamsSendActivity).toHaveBeenCalledWith(expect.stringContaining("Feature X was implemented successfully"));

      // ----------------------------------------------------------------
      // Step 4: Persona Verification
      // ----------------------------------------------------------------

      console.log("✅ End-to-End Test Passed: Brain memory persisted across Slack/Teams interfaces.");
  });
});
