import { describe, it, expect, vi, beforeEach } from "vitest";
import { Engine } from "../src/engine/orchestrator.js";

// Mock Engine.run
const runSpy = vi.spyOn(Engine.prototype, "run").mockResolvedValue(undefined);

// Mock dependencies
vi.mock("../src/llm.js", () => ({
  createLLM: () => ({}),
}));
vi.mock("../src/mcp.js", () => ({
  MCP: class {
    init = vi.fn();
    getTools = vi.fn().mockResolvedValue([]);
    isServerRunning = vi.fn().mockReturnValue(false);
    startServer = vi.fn();
    getClient = vi.fn();
  }
}));
vi.mock("../src/skills.js", () => ({
  getActiveSkill: vi.fn().mockResolvedValue({ systemPrompt: "" })
}));

// Mock Slack deps
vi.mock("@slack/bolt", () => ({
  App: class {
    event = vi.fn();
    action = vi.fn();
    start = vi.fn();
  }
}));

// Mock Teams deps
vi.mock("botbuilder", () => ({
  CloudAdapter: class {
    onTurnError = vi.fn();
    process = vi.fn();
  },
  ConfigurationServiceClientCredentialFactory: class {},
  createBotFrameworkAuthenticationFromConfiguration: vi.fn(),
  ActivityHandler: class {
    onMessage = vi.fn();
    onMembersAdded = vi.fn();
    run = vi.fn();
  },
  TurnContext: {
    removeRecipientMention: (activity: any) => activity.text
  },
  MessageFactory: {
    text: (t: string) => t
  },
  ActivityTypes: {
    MessageReaction: "reaction",
    Typing: "typing"
  }
}));

// Mock Express
vi.mock("express", () => {
    const app = {
        use: vi.fn(),
        post: vi.fn(),
        listen: vi.fn()
    };
    const express = () => app;
    express.json = vi.fn();
    return { default: express };
});


describe("Interface Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("SlackEngine should parse --company flag", async () => {
    const { app } = await import("../src/interfaces/slack.js");

    // @ts-ignore
    const eventCalls = app.event.mock.calls;
    const mentionHandler = eventCalls.find((call: any) => call[0] === "app_mention")[1];

    expect(mentionHandler).toBeDefined();

    // Simulate event
    const mockClient = {
        reactions: { add: vi.fn() },
        chat: { postMessage: vi.fn() }
    };
    const mockEvent = {
        channel: "C123",
        text: "<@U123> Hello --company client-a",
        ts: "123.456"
    };

    await mentionHandler({ event: mockEvent, client: mockClient });

    expect(runSpy).toHaveBeenCalledWith(
        expect.anything(),
        "Hello",
        expect.objectContaining({
            company: "client-a"
        })
    );
  });

  it("TeamsEngine should parse --company flag", async () => {
    const { bot } = await import("../src/interfaces/teams.js");

    // @ts-ignore
    const onMessageSpy = bot.onMessage;
    const handler = onMessageSpy.mock.calls[0][0];
    expect(handler).toBeDefined();

    const mockContext = {
        activity: {
            type: "message",
            text: "Hello --company client-b",
            id: "123",
            recipient: { id: "bot" },
            attachments: []
        },
        sendActivity: vi.fn(),
        sendActivities: vi.fn()
    };
    const next = vi.fn();

    await handler(mockContext, next);

    expect(runSpy).toHaveBeenCalledWith(
        expect.anything(),
        "Hello",
        expect.objectContaining({
            company: "client-b"
        })
    );
  });
});
