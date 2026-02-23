import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersonaEngine } from '../../src/persona.js';

// ------------------------------------------------------------------
// 1. Hoisted Variables for Capturing Handlers
// ------------------------------------------------------------------
const handlers = vi.hoisted(() => ({
    slack: { value: null as any },
    teams: { value: null as any },
    discord: { value: null as any }
}));

// ------------------------------------------------------------------
// 2. Mock External Libraries
// ------------------------------------------------------------------

vi.mock('@slack/bolt', () => {
    return {
        App: vi.fn().mockImplementation(() => ({
            event: vi.fn((event, handler) => {
                if (event === 'app_mention') handlers.slack.value = handler;
            }),
            action: vi.fn(),
            start: vi.fn(),
        }))
    };
});

vi.mock('botbuilder', () => {
    return {
        CloudAdapter: vi.fn().mockImplementation(() => ({
            onTurnError: null,
            process: vi.fn(),
        })),
        ActivityHandler: class {
            constructor() {
                handlers.teams.value = this;
                (this as any)._onMessage = null;
                (this as any)._onMembersAdded = null;
            }
            onMessage(handler: any) { (this as any)._onMessage = handler; }
            onMembersAdded(handler: any) { (this as any)._onMembersAdded = handler; }
            // Helper to manually trigger message
            async run(context: any) {
                if (context.activity.type === 'message' && (this as any)._onMessage) {
                    await (this as any)._onMessage(context, async () => {});
                }
            }
        },
        TurnContext: {
            removeRecipientMention: (activity: any) => activity.text || '',
        },
        ConfigurationServiceClientCredentialFactory: vi.fn(),
        createBotFrameworkAuthenticationFromConfiguration: vi.fn(),
        ActivityTypes: {
            MessageReaction: 'messageReaction',
            Typing: 'typing',
        },
        MessageFactory: { text: (t: string) => t }
    };
});

vi.mock('discord.js', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            once: vi.fn(),
            on: vi.fn((event, handler) => {
                if (event === 'messageCreate') handlers.discord.value = handler;
            }),
            login: vi.fn(),
            user: { tag: 'TestBot', id: 'bot-id' },
        })),
        GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 32768, DirectMessages: 4096 },
        Partials: { Channel: 1 },
        Events: { ClientReady: 'ready', MessageCreate: 'messageCreate' },
    };
});

// Mock Dependencies
vi.mock('../../src/llm.js', async () => {
    const actual = await vi.importActual('../../src/llm.js');
    return {
        ...actual,
        createLLM: () => ({
            personaEngine: new PersonaEngine(), // Use real PersonaEngine (mocked prototype)
            generate: vi.fn().mockResolvedValue({
                message: "I am ready.",
                thought: "Processing...",
                usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
            }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)) // Mock embedding
        })
    };
});

// Import Interfaces (triggers mocks)
import '../../src/interfaces/slack.js';
import '../../src/interfaces/teams.js';
import '../../src/interfaces/discord.js';

describe('Persona Integration Tests', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Default: 10:00 AM (Within 09:00-17:00)
        vi.setSystemTime(new Date('2023-01-01T10:00:00'));

        // Mock Persona Config
        vi.spyOn(PersonaEngine.prototype, 'loadConfig').mockImplementation(async function(this: PersonaEngine) {
            (this as any).config = {
                name: 'Sarah_DevOps',
                role: 'DevOps Engineer',
                voice: { tone: 'professional' },
                emoji_usage: true,
                catchphrases: { greeting: [], signoff: [], filler: [] },
                working_hours: '09:00-17:00',
                response_latency: { min: 10, max: 20 }, // Short latency for tests
                enabled: true
            };
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // ------------------------------------------------------------------
    // SLACK TESTS
    // ------------------------------------------------------------------
    describe('Slack Interface', () => {
        it('should respect working hours (Slack)', async () => {
            // Set time to 18:00 (Outside working hours)
            vi.setSystemTime(new Date('2023-01-01T18:00:00'));

            const clientMock = {
                chat: { postMessage: vi.fn() },
                reactions: { add: vi.fn() }
            };

            await handlers.slack.value({
                event: { channel: 'C123', text: '<@U123> help', ts: '12345' },
                client: clientMock
            });

            // Verify OOO message
            expect(clientMock.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                text: expect.stringContaining('I am currently offline')
            }));

            // Verify working hours are mentioned
            expect(clientMock.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                text: expect.stringContaining('09:00-17:00')
            }));
        });

        it('should add reaction and typing indicator (Slack)', async () => {
             // Set time to 10:00 (Inside working hours)
             vi.setSystemTime(new Date('2023-01-01T10:00:00'));

             const clientMock = {
                 chat: { postMessage: vi.fn() },
                 reactions: { add: vi.fn() }
             };

             await handlers.slack.value({
                 event: { channel: 'C123', text: '<@U123> help me with docker', ts: '12345' },
                 client: clientMock
             });

             // Verify Reaction
             expect(clientMock.reactions.add).toHaveBeenCalledWith(expect.objectContaining({
                 name: 'thumbsup' // Short text -> thumbsup
             }));

             // Verify Typing Indicator (Thinking... message)
             expect(clientMock.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
                 text: 'Thinking...'
             }));
        });

        it('should use construction emoji for long tasks (Slack)', async () => {
            const longText = "This is a very long task description that should trigger the construction worker emoji because it is longer than 50 characters.";
            const clientMock = {
                chat: { postMessage: vi.fn() },
                reactions: { add: vi.fn() }
            };

            await handlers.slack.value({
                event: { channel: 'C123', text: `<@U123> ${longText}`, ts: '12345' },
                client: clientMock
            });

            // Verify Reaction
            expect(clientMock.reactions.add).toHaveBeenCalledWith(expect.objectContaining({
                name: 'building_construction' // mapped from 🏗️
            }));
        });
    });

    // ------------------------------------------------------------------
    // TEAMS TESTS
    // ------------------------------------------------------------------
    describe('Teams Interface', () => {
        it('should respect working hours (Teams)', async () => {
            vi.setSystemTime(new Date('2023-01-01T18:00:00')); // 18:00

            const contextMock = {
                activity: { type: 'message', text: 'hello', recipient: { id: 'bot' } },
                sendActivity: vi.fn(),
                sendActivities: vi.fn()
            };

            await handlers.teams.value.run(contextMock);

            expect(contextMock.sendActivity).toHaveBeenCalledWith(expect.stringContaining('I am currently offline'));
        });

        it('should add reaction (Teams)', async () => {
            vi.setSystemTime(new Date('2023-01-01T10:00:00')); // 10:00

            const contextMock = {
                activity: { type: 'message', text: 'hello', id: 'msg123', recipient: { id: 'bot' } },
                sendActivity: vi.fn(),
                sendActivities: vi.fn()
            };

            await handlers.teams.value.run(contextMock);

            expect(contextMock.sendActivities).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({
                    type: 'messageReaction',
                    reactionsAdded: expect.arrayContaining([{ type: 'like' }])
                })
            ]));
        });
    });

    // ------------------------------------------------------------------
    // DISCORD TESTS
    // ------------------------------------------------------------------
    describe('Discord Interface', () => {
        it('should respect working hours (Discord)', async () => {
            vi.setSystemTime(new Date('2023-01-01T18:00:00')); // 18:00

            const messageMock = {
                author: { bot: false },
                content: 'hello',
                mentions: { users: { has: () => true } },
                guild: {},
                reply: vi.fn(),
                react: vi.fn(),
                channel: { sendTyping: vi.fn(), send: vi.fn().mockReturnValue(Promise.resolve({})) } // Added send with Promise
            };

            await handlers.discord.value(messageMock);

            expect(messageMock.reply).toHaveBeenCalledWith(expect.stringContaining('I am currently offline'));
        });

        it('should add reaction and typing (Discord)', async () => {
            vi.setSystemTime(new Date('2023-01-01T10:00:00')); // 10:00

            const messageMock = {
                author: { bot: false },
                content: 'hello',
                mentions: { users: { has: () => true } },
                guild: {},
                reply: vi.fn(),
                react: vi.fn(),
                channel: { sendTyping: vi.fn(), send: vi.fn().mockReturnValue(Promise.resolve({})) } // Added send with Promise
            };

            await handlers.discord.value(messageMock);

            expect(messageMock.react).toHaveBeenCalledWith('👍'); // Short text
            expect(messageMock.channel.sendTyping).toHaveBeenCalled();
            expect(messageMock.reply).toHaveBeenCalledWith('Thinking...');
        });

         it('should use construction emoji for long tasks (Discord)', async () => {
            const longText = "This is a very long task description that should trigger the construction worker emoji because it is longer than 50 characters.";
            const messageMock = {
                author: { bot: false },
                content: longText,
                mentions: { users: { has: () => true } },
                guild: {},
                reply: vi.fn(),
                react: vi.fn(),
                channel: { sendTyping: vi.fn(), send: vi.fn() } // Added send
            };

            await handlers.discord.value(messageMock);

            expect(messageMock.react).toHaveBeenCalledWith('🏗️');
        });
    });

    // ------------------------------------------------------------------
    // PERSONA ENGINE HELPERS
    // ------------------------------------------------------------------
    describe('Persona Engine Helpers', () => {
        it('calculateTypingDelay should be proportional to length', () => {
            const engine = new PersonaEngine();
            // Mock config for this test instance
            (engine as any).config = {
                response_latency: { min: 100, max: 1000 }
            };

            const delayShort = engine.calculateTypingDelay(10); // 300ms
            const delayLong = engine.calculateTypingDelay(100); // 3000ms -> capped at 1000ms

            expect(delayShort).toBeGreaterThanOrEqual(100);
            expect(delayShort).toBeLessThanOrEqual(1000);

            expect(delayLong).toBeGreaterThanOrEqual(100);
            expect(delayLong).toBeLessThanOrEqual(1000);

            // Expect jitter
            expect(delayShort).toBeGreaterThan(250);
            expect(delayShort).toBeLessThan(350);
        });
    });
});
