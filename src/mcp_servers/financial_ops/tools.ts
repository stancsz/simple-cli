import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Stripe from "stripe";
import { createLLM } from "../../llm.js";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from 'url';

// Initialize Stripe Lazily
let stripeInstance: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set. Please add it to .env.agent");
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2026-01-28.clover' as any, // Cast to any to avoid TS version mismatch if SDK types drift
    });
  }
  return stripeInstance;
}

// Local Ledger Helper
const LEDGER_DIR = join(process.cwd(), ".agent", "financial_ops");
const LEDGER_FILE = join(LEDGER_DIR, "ledger.json");

function ensureLedger() {
  if (!existsSync(LEDGER_DIR)) {
    mkdirSync(LEDGER_DIR, { recursive: true });
  }
  if (!existsSync(LEDGER_FILE)) {
    writeFileSync(LEDGER_FILE, JSON.stringify([], null, 2));
  }
}

async function logToLedger(entry: any) {
  ensureLedger();
  let data: any[] = [];
  try {
    const content = readFileSync(LEDGER_FILE, "utf-8");
    data = JSON.parse(content);
  } catch (e) {
    data = [];
  }

  const enrichedEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry
  };

  data.push(enrichedEntry);
  writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2));
  return enrichedEntry;
}

// LLM Summary Helper
async function generateTransactionSummary(details: any): Promise<string> {
  try {
    // Only attempt LLM if API keys are present in env
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.DEEPSEEK_API_KEY) {
        return "Transaction recorded (No LLM API Key for summary)";
    }

    const llm = createLLM();
    const prompt = `Summarize this financial transaction into a concise sentence for episodic memory log. Return ONLY the sentence. Details: ${JSON.stringify(details)}`;
    const response = await llm.generate("You are a financial assistant.", [{ role: 'user', content: prompt }]);
    return response.message || response.thought || "Transaction recorded.";
  } catch (e) {
    console.error("LLM Summary failed:", e);
    return "Transaction recorded (LLM summary failed).";
  }
}

export function registerTools(server: McpServer) {

  server.tool(
    "list_invoices",
    "List invoices from Stripe.",
    {
      limit: z.number().optional().default(10).describe("Number of invoices to return"),
      status: z.enum(["draft", "open", "paid", "uncollectible", "void"]).optional().describe("Filter by status")
    },
    async ({ limit, status }) => {
      try {
        const stripe = getStripe();
        const invoices = await stripe.invoices.list({ limit, status: status as Stripe.InvoiceListParams.Status });
        return { content: [{ type: "text", text: JSON.stringify(invoices.data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error listing invoices: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "create_customer",
    "Create a new customer in Stripe.",
    {
      email: z.string().email().describe("Customer email"),
      name: z.string().describe("Customer full name"),
      description: z.string().optional().describe("Customer description")
    },
    async ({ email, name, description }) => {
      try {
        const stripe = getStripe();
        const customer = await stripe.customers.create({ email, name, description });

        // Log creation to local ledger as an event
        const summary = await generateTransactionSummary({ event: "Customer Created", id: customer.id, name });
        await logToLedger({ type: "event", event: "customer_created", stripe_id: customer.id, summary });

        return { content: [{ type: "text", text: JSON.stringify(customer, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error creating customer: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_balance",
    "Retrieve current Stripe balance.",
    {},
    async () => {
      try {
        const stripe = getStripe();
        const balance = await stripe.balance.retrieve();
        return { content: [{ type: "text", text: JSON.stringify(balance, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error retrieving balance: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "create_subscription",
    "Create a subscription for a customer.",
    {
      customer_id: z.string().describe("Stripe Customer ID"),
      price_id: z.string().describe("Stripe Price ID")
    },
    async ({ customer_id, price_id }) => {
      try {
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.create({
          customer: customer_id,
          items: [{ price: price_id }],
        });

        const summary = await generateTransactionSummary({ event: "Subscription Created", id: subscription.id, amount: subscription.items.data[0].price.unit_amount });
        await logToLedger({ type: "subscription", stripe_id: subscription.id, summary });

        return { content: [{ type: "text", text: JSON.stringify(subscription, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error creating subscription: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    "create_expense",
    "Record an expense in the local ledger (simulated accounting).",
    {
      amount: z.number().describe("Expense amount"),
      currency: z.string().default("usd").describe("Currency code"),
      description: z.string().describe("Description of the expense"),
      category: z.string().optional().default("general").describe("Expense category")
    },
    async ({ amount, currency, description, category }) => {
      try {
        const entry = {
          type: "expense",
          amount,
          currency,
          description,
          category
        };

        const summary = await generateTransactionSummary(entry);
        const loggedEntry = await logToLedger({ ...entry, summary });

        return {
          content: [{
            type: "text",
            text: `Expense recorded in local ledger.\nID: ${loggedEntry.id}\nSummary: ${summary}\n\nPlease sync this to the Brain if needed using 'log_experience'.`
          }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error recording expense: ${(error as Error).message}` }], isError: true };
      }
    }
  );

  // Internal tool for testing or manual logging
  server.tool(
      "log_transaction",
      "Manually log a transaction to the local financial ledger.",
      {
          details: z.string().describe("JSON string of transaction details")
      },
      async ({ details }) => {
          try {
              const parsed = JSON.parse(details);
              const summary = await generateTransactionSummary(parsed);
              const logged = await logToLedger({ type: "manual", data: parsed, summary });
              return { content: [{ type: "text", text: `Transaction logged locally. ID: ${logged.id}` }] };
          } catch (e) {
              return { content: [{ type: "text", text: `Failed to log: ${(e as Error).message}` }], isError: true };
          }
      }
  );
}
