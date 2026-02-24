import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, unlinkSync, readFileSync, mkdirSync } from "fs";

// Hoisted Mocks
const { mockStripeClient } = vi.hoisted(() => {
    return {
        mockStripeClient: {
            invoices: { list: vi.fn() },
            customers: { create: vi.fn() },
            balance: { retrieve: vi.fn() },
            subscriptions: { create: vi.fn() }
        }
    };
});

// Mock Stripe
vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => mockStripeClient)
  };
});

// Mock LLM
vi.mock("../../src/llm.js", () => ({
  createLLM: () => ({
    generate: async () => ({
      message: "LLM Summary: Transaction processed.",
      thought: "Processing..."
    })
  })
}));

// Mock McpServer
const mockToolHandlers = new Map<string, Function>();
class MockMcpServer {
  tool(name: string, description: string, schema: any, handler: Function) {
    mockToolHandlers.set(name, handler);
  }
}

// Import AFTER mocking
import { registerTools } from "../../src/mcp_servers/financial_ops/tools.js";


describe("Financial Ops MCP Server", () => {
  let server: MockMcpServer;
  const LEDGER_DIR = join(process.cwd(), ".agent", "financial_ops");
  const LEDGER_FILE = join(LEDGER_DIR, "ledger.json");

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolHandlers.clear();
    process.env.STRIPE_SECRET_KEY = "sk_test_12345";

    server = new MockMcpServer();
    registerTools(server as any);

    // Clean ledger
    if (existsSync(LEDGER_FILE)) {
      unlinkSync(LEDGER_FILE);
    }
    if (!existsSync(LEDGER_DIR)) {
        mkdirSync(LEDGER_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(LEDGER_FILE)) {
      unlinkSync(LEDGER_FILE);
    }
  });

  it("should list invoices", async () => {
    mockStripeClient.invoices.list.mockResolvedValue({
        data: [{ id: "in_123", amount_due: 1000 }]
    });

    const handler = mockToolHandlers.get("list_invoices");
    expect(handler).toBeDefined();

    const result = await handler!({ limit: 10 });
    expect(result.content[0].text).toContain("in_123");
    expect(mockStripeClient.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("should create customer and log to ledger", async () => {
    mockStripeClient.customers.create.mockResolvedValue({
        id: "cus_123", email: "test@example.com", name: "Test User"
    });

    const handler = mockToolHandlers.get("create_customer");
    const result = await handler!({ email: "test@example.com", name: "Test User" });

    expect(result.content[0].text).toContain("cus_123");

    // Verify Ledger
    expect(existsSync(LEDGER_FILE)).toBe(true);
    const ledger = JSON.parse(readFileSync(LEDGER_FILE, "utf-8"));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].event).toBe("customer_created");
    expect(ledger[0].stripe_id).toBe("cus_123");
  });

  it("should get balance", async () => {
    mockStripeClient.balance.retrieve.mockResolvedValue({
        available: [{ amount: 5000, currency: "usd" }]
    });

    const handler = mockToolHandlers.get("get_balance");
    const result = await handler!({});
    expect(result.content[0].text).toContain("5000");
  });

  it("should create subscription", async () => {
    mockStripeClient.subscriptions.create.mockResolvedValue({
        id: "sub_123",
        items: { data: [{ price: { unit_amount: 2000 } }] }
    });

    const handler = mockToolHandlers.get("create_subscription");
    const result = await handler!({ customer_id: "cus_123", price_id: "price_123" });

    expect(result.content[0].text).toContain("sub_123");

    // Verify Ledger
    const ledger = JSON.parse(readFileSync(LEDGER_FILE, "utf-8"));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("subscription");
  });

  it("should record local expense", async () => {
    const handler = mockToolHandlers.get("create_expense");
    const result = await handler!({
        amount: 50.00,
        description: "Server Hosting",
        category: "Infrastructure"
    });

    expect(result.content[0].text).toContain("Expense recorded");

    // Verify Ledger
    const ledger = JSON.parse(readFileSync(LEDGER_FILE, "utf-8"));
    expect(ledger[0].type).toBe("expense");
    expect(ledger[0].amount).toBe(50);
  });
});
