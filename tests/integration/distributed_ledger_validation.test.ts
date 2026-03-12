import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EpisodicMemory, LedgerEntry } from "../../src/brain/episodic.js";
import { recordTransaction, getAgencyBalance, proposeSettlement } from "../../src/mcp_servers/distributed_ledger/ledger.js";
import { rm } from "fs/promises";
import { join } from "path";
import * as strategyTools from "../../src/mcp_servers/brain/tools/strategy.js";

const TEST_DB_PATH = join(process.cwd(), ".agent", "test_brain_ledger");

describe("Distributed Ledger - Phase 31 Validation", () => {
    let episodic: EpisodicMemory;
    const testCompany = "test_ledger_company";

    beforeEach(async () => {
        episodic = new EpisodicMemory(TEST_DB_PATH);
        await episodic.init();

        // Mock the strategy reader to return a specific revenue split
        vi.spyOn(strategyTools, "readStrategy").mockResolvedValue({
            vision: "Test Vision",
            objectives: ["Test"],
            timestamp: Date.now(),
            policies: {
                revenue_sharing: { split: 0.7 }
            }
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        try {
            await rm(TEST_DB_PATH, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    it("should correctly record a transaction with revenue splitting applied", async () => {
        const entry: LedgerEntry = {
            id: "tx_001",
            timestamp: Date.now(),
            from_agency: "agency_a",
            to_agency: "agency_b",
            resource_type: "revenue",
            quantity: 100,
            value: 100,
            status: "pending"
        };

        const entries = await recordTransaction(episodic, entry, testCompany);

        expect(entries.length).toBe(2);

        const mainEntry = entries.find(e => e.id === "tx_001")!;
        expect(mainEntry).toBeDefined();
        expect(mainEntry.from_agency).toBe("agency_a");
        expect(mainEntry.to_agency).toBe("agency_b");
        expect(mainEntry.value).toBe(70); // 100 * 0.7

        const splitEntry = entries.find(e => e.id === "tx_001_split")!;
        expect(splitEntry).toBeDefined();
        expect(splitEntry.from_agency).toBe("bank");
        expect(splitEntry.to_agency).toBe("agency_b");
        expect(Math.round(splitEntry.value)).toBe(30); // 100 * 0.3 rounded
    });

    it("should enforce idempotency when recording the same transaction ID", async () => {
        const entry: LedgerEntry = {
            id: "tx_002",
            timestamp: Date.now(),
            from_agency: "agency_x",
            to_agency: "agency_y",
            resource_type: "compute",
            quantity: 50,
            value: 10,
            status: "pending"
        };

        // First insert
        const firstInsert = await recordTransaction(episodic, entry, testCompany);
        expect(firstInsert.length).toBeGreaterThan(0);

        // Second insert with same ID
        const secondInsert = await recordTransaction(episodic, entry, testCompany);
        expect(secondInsert.length).toBe(1); // Should just return the existing main entry
        expect(secondInsert[0].id).toBe("tx_002");
    });

    it("should correctly calculate agency balances", async () => {
        // We will insert transactions manually without the revenue split to test basic balance calculation
        await episodic.storeLedgerEntry({
            id: "b_001", timestamp: Date.now(), from_agency: "agency_1", to_agency: "agency_2",
            resource_type: "llm_tokens", quantity: 1000, value: 5, status: "pending"
        }, testCompany);

        await episodic.storeLedgerEntry({
            id: "b_002", timestamp: Date.now(), from_agency: "agency_2", to_agency: "agency_1",
            resource_type: "llm_tokens", quantity: 200, value: 1, status: "pending"
        }, testCompany);

        const balances1 = await getAgencyBalance(episodic, "agency_1", testCompany);
        const tokenBalance1 = balances1.find(b => b.resource === "llm_tokens");
        expect(tokenBalance1).toBeDefined();
        expect(tokenBalance1!.balance).toBe(800); // 1000 (from) - 200 (to)
        expect(tokenBalance1!.value).toBe(4);     // 5 (from) - 1 (to)

        const balances2 = await getAgencyBalance(episodic, "agency_2", testCompany);
        const tokenBalance2 = balances2.find(b => b.resource === "llm_tokens");
        expect(tokenBalance2).toBeDefined();
        expect(tokenBalance2!.balance).toBe(-800); // 200 (from) - 1000 (to)
        expect(tokenBalance2!.value).toBe(-4);
    });

    it("should propose a settlement", async () => {
        const settlement = await proposeSettlement(episodic, "agency_2", "agency_1", 800, "llm_tokens", testCompany);

        expect(settlement.status).toBe("pending");
        expect(settlement.from_agency).toBe("agency_2");
        expect(settlement.to_agency).toBe("agency_1");
        expect(settlement.quantity).toBe(800);

        // Verify it was stored
        const entries = await episodic.getLedgerEntries(testCompany);
        const found = entries.find(e => e.id === settlement.id);
        expect(found).toBeDefined();
    });
});
