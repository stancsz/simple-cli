import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProposalStorage } from "../storage.js";
import { Proposal } from "../types.js";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), ".test_hr_storage");

describe("ProposalStorage", () => {
  let storage: ProposalStorage;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    storage = new ProposalStorage(TEST_DIR);
    await storage.init();
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should initialize storage file", async () => {
    expect(existsSync(join(TEST_DIR, ".agent", "hr", "proposals.json"))).toBe(true);
  });

  it("should add and retrieve a proposal", async () => {
    const proposal: Proposal = {
      id: "1",
      title: "Test Proposal",
      description: "Test Description",
      affectedFiles: ["file.ts"],
      patch: "diff",
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.add(proposal);
    const retrieved = storage.get("1");
    expect(retrieved).toEqual(proposal);
  });

  it("should list pending proposals", async () => {
    const p1: Proposal = {
      id: "1",
      title: "P1",
      description: "D1",
      affectedFiles: [],
      patch: "",
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const p2: Proposal = {
      id: "2",
      title: "P2",
      description: "D2",
      affectedFiles: [],
      patch: "",
      status: "approved",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.add(p1);
    await storage.add(p2);

    const pending = storage.getPending();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("1");
  });

  it("should update a proposal", async () => {
    const p1: Proposal = {
      id: "1",
      title: "P1",
      description: "D1",
      affectedFiles: [],
      patch: "",
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await storage.add(p1);

    // Wait a bit to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 2));

    await storage.update("1", { status: "approved" });
    const updated = storage.get("1");
    expect(updated?.status).toBe("approved");
    expect(updated?.updatedAt).toBeGreaterThan(p1.updatedAt);
  });
});
