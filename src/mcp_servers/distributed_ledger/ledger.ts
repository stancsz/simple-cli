import { EpisodicMemory, LedgerEntry } from "../../brain/episodic.js";
import { readStrategy } from "../brain/tools/strategy.js";

/**
 * Applies revenue splitting logic based on Corporate Strategy and records the split transaction.
 */
export async function applyRevenueSplit(episodic: EpisodicMemory, entry: LedgerEntry, company?: string): Promise<LedgerEntry[]> {
    const strategy = await readStrategy(episodic, company);
    let splitRatio = 1.0; // Default: recipient keeps 100%

    if (strategy && strategy.policies && strategy.policies.revenue_sharing) {
        // e.g., "70/30" or { "split": 0.7 }
        if (typeof strategy.policies.revenue_sharing.split === "number") {
             splitRatio = strategy.policies.revenue_sharing.split;
        }
    }

    const entries: LedgerEntry[] = [];

    // To ensure the consumer (to_agency) is debited the full 100%,
    // the provider (from_agency) is credited the split portion,
    // and the bank is credited the remainder:

    // Main entry: Provider -> Consumer (Split portion)
    const mainEntry: LedgerEntry = {
        ...entry,
        quantity: entry.quantity * splitRatio,
        value: entry.value * splitRatio
    };
    entries.push(mainEntry);

    // Split entry (if any): Bank -> Consumer (Remainder)
    if (splitRatio < 1.0) {
        const bankAgency = "bank"; // Usually the single-authority bank or corporate level
        const splitEntry: LedgerEntry = {
            id: entry.id + "_split", // Deriving an ID for the split part
            timestamp: entry.timestamp,
            from_agency: bankAgency, // Bank acts as provider for the remaining charge
            to_agency: entry.to_agency, // Original consumer pays the remainder
            resource_type: entry.resource_type,
            quantity: entry.quantity * (1 - splitRatio),
            value: entry.value * (1 - splitRatio),
            status: entry.status
        };
        entries.push(splitEntry);
    }

    return entries;
}

export async function recordTransaction(episodic: EpisodicMemory, entry: LedgerEntry, company?: string): Promise<LedgerEntry[]> {
    // Idempotency check
    const existingEntries = await episodic.getLedgerEntries(company);
    const exists = existingEntries.find((e: LedgerEntry) => e.id === entry.id);

    if (exists) {
        return [exists]; // Return existing entry if already recorded
    }

    // Apply revenue split and insert entries
    const entriesToStore = await applyRevenueSplit(episodic, entry, company);

    for (const e of entriesToStore) {
        await episodic.storeLedgerEntry(e, company);
    }

    return entriesToStore;
}

export async function getAgencyBalance(episodic: EpisodicMemory, agencyName: string, company?: string): Promise<{ resource: string, balance: number, value: number }[]> {
    const entries = await episodic.getLedgerEntries(company);

    const balances: Record<string, { balance: number, value: number }> = {};

    for (const entry of entries) {
        if (!balances[entry.resource_type]) {
             balances[entry.resource_type] = { balance: 0, value: 0 };
        }

        // If agency provided the resource (from_agency), they gain balance (credit)
        if (entry.from_agency === agencyName) {
            balances[entry.resource_type].balance += entry.quantity;
            balances[entry.resource_type].value += entry.value;
        }

        // If agency consumed the resource (to_agency), they lose balance (debit)
        if (entry.to_agency === agencyName) {
             balances[entry.resource_type].balance -= entry.quantity;
             balances[entry.resource_type].value -= entry.value;
        }
    }

    return Object.keys(balances).map(key => ({
        resource: key,
        balance: balances[key].balance,
        value: balances[key].value
    }));
}

export async function proposeSettlement(episodic: EpisodicMemory, fromAgency: string, toAgency: string, amount: number, resourceType: string, company?: string): Promise<LedgerEntry> {
     const settlementEntry: LedgerEntry = {
          id: `settlement_${Date.now()}_${fromAgency}_${toAgency}`,
          timestamp: Date.now(),
          from_agency: fromAgency,
          to_agency: toAgency,
          resource_type: resourceType,
          quantity: amount,
          value: amount, // Assuming 1:1 for simplicity or it handles USD natively
          status: "pending"
     };

     await episodic.storeLedgerEntry(settlementEntry, company);
     return settlementEntry;
}
