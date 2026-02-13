import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Psyche } from "../src/psyche.js";
import { join } from "path";
import { rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";

const TEST_DIR = join(process.cwd(), ".test_psyche_security");

describe("Psyche Security", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR))
      rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR))
      rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should store state in an encrypted format", async () => {
    const psyche = new Psyche(TEST_DIR);
    psyche.state.live_metrics.trust = 0.88;
    await psyche.save();

    const statePath = join(TEST_DIR, ".agent", "state.json");
    const content = readFileSync(statePath, "utf-8");

    // Should not contain the plaintext value
    expect(content).not.toContain("0.88");

    // Should be a JSON with iv, tag, data
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("iv");
    expect(parsed).toHaveProperty("tag");
    expect(parsed).toHaveProperty("data");
  });

  it("should decrypt state correctly", async () => {
    const psyche = new Psyche(TEST_DIR);
    psyche.state.live_metrics.trust = 0.77;
    await psyche.save();

    const psyche2 = new Psyche(TEST_DIR);
    await psyche2.load();
    expect(psyche2.state.live_metrics.trust).toBe(0.77);
  });

  it("should fallback to default state if decryption fails (tampering)", async () => {
    const psyche = new Psyche(TEST_DIR);
    psyche.state.live_metrics.trust = 0.99;
    await psyche.save();

    const statePath = join(TEST_DIR, ".agent", "state.json");
    const content = readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(content);

    // Tamper with data
    parsed.data = Buffer.from("malicious-tampering").toString("base64");
    writeFileSync(statePath, JSON.stringify(parsed));

    const psyche2 = new Psyche(TEST_DIR);
    await psyche2.load();

    // Should fallback to default trust (0.5) instead of 0.99
    expect(psyche2.state.live_metrics.trust).toBe(0.5);
  });

  it("should migrate plaintext state to encrypted format", async () => {
    const agentDir = join(TEST_DIR, ".agent");
    mkdirSync(agentDir, { recursive: true });
    const statePath = join(agentDir, "state.json");

    const plaintextState = {
      dna: { mbti: "INTJ", ocean: { O: 0.5, C: 0.5, E: 0.5, A: 0.5, N: 0.5 } },
      live_metrics: { trust: 0.12, irritation: 0.1, interaction_count: 0, core_trauma: [] }
    };
    writeFileSync(statePath, JSON.stringify(plaintextState));

    const psyche = new Psyche(TEST_DIR);
    await psyche.load();

    expect(psyche.state.live_metrics.trust).toBe(0.12);

    // Save should now encrypt it
    await psyche.save();

    const newContent = readFileSync(statePath, "utf-8");
    expect(newContent).not.toContain("0.12");
    expect(JSON.parse(newContent)).toHaveProperty("iv");
  });
});
