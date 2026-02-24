/**
 * Tests for skills system
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  builtinSkills,
  getActiveSkill,
  setActiveSkill,
  listSkills,
  loadSkillFromFile,
  saveSkillToFile,
  loadCustomSkills,
  buildSkillPrompt,
  type Skill,
} from "../src/skills.js";

describe("skills", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-skills-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    // Reset skill to default
    delete process.env.SIMPLE_CLI_SKILL;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env.SIMPLE_CLI_SKILL;
  });

  describe("builtinSkills", () => {
    it("should have code skill", () => {
      expect(builtinSkills.code).toBeDefined();
      expect(builtinSkills.code.name).toBe("code");
    });

    it('should include "Simple Biosphere" identity in default system prompt', () => {
      expect(builtinSkills.code.systemPrompt).toContain("Simple Biosphere");
      expect(builtinSkills.code.systemPrompt).toContain(
        'When users ask about "Simple", "Simple Biosphere", or "you", they are referring to you.',
      );
    });
  });

  describe("getActiveSkill", () => {
    it("should return code skill by default", async () => {
      const skill = await getActiveSkill(testDir);
      expect(skill.name).toBe("code");
    });

    it("should load from .agent/AGENT.md", async () => {
      const agentDir = join(testDir, ".agent");
      await mkdir(agentDir, { recursive: true });
      const agentMd = join(agentDir, "AGENT.md");
      await writeFile(agentMd, "# My Agent\n\nMy custom prompt.");

      const skill = await getActiveSkill(testDir);
      expect(skill.name).toBe("My Agent");
      expect(skill.systemPrompt).toContain("My custom prompt.");
    });

    it("should load from .agent/SOUL.md", async () => {
      const agentDir = join(testDir, ".agent");
      await mkdir(agentDir, { recursive: true });
      const soulMd = join(agentDir, "SOUL.md");
      await writeFile(soulMd, "# Soul Agent\n\nSoul prompt.");

      const skill = await getActiveSkill(testDir);
      expect(skill.name).toBe("Soul Agent");
    });
  });

  describe("setActiveSkill", () => {
    it("should set valid skill", () => {
      const skill = setActiveSkill("code");
      expect(skill).toBeDefined();
      expect(skill?.name).toBe("code");
      expect(process.env.SIMPLE_CLI_SKILL).toBe("code");
    });

    it("should return undefined for invalid skill", () => {
      const skill = setActiveSkill("invalid");
      expect(skill).toBeUndefined();
    });
  });

  describe("listSkills", () => {
    it("should return all skills", () => {
      const skills = listSkills();
      expect(skills.length).toBe(Object.keys(builtinSkills).length);
    });
  });

  describe("loadSkillFromFile", () => {
    it("should load valid JSON skill file", async () => {
      const skillPath = join(testDir, "custom.json");
      const customSkill: Skill = {
        name: "custom",
        description: "A custom skill",
        systemPrompt: "You are a custom assistant.",
        tools: ["read_files"],
      };
      await writeFile(skillPath, JSON.stringify(customSkill));

      const loaded = await loadSkillFromFile(skillPath);

      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe("custom");
      expect(loaded?.systemPrompt).toBe("You are a custom assistant.");
    });

    it("should load valid Markdown skill file", async () => {
      const skillPath = join(testDir, "custom.md");
      await writeFile(skillPath, "# Markdown Agent\n\nThis is a prompt.");

      const loaded = await loadSkillFromFile(skillPath);
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe("Markdown Agent");
      expect(loaded?.systemPrompt).toContain("This is a prompt.");
    });
  });

  describe("loadCustomSkills", () => {
    it("should load all skills from directory", async () => {
      await writeFile(
        join(testDir, "skill1.json"),
        JSON.stringify({
          name: "skill1",
          description: "d1",
          systemPrompt: "p1",
        }),
      );
      await writeFile(join(testDir, "skill2.md"), "# skill2\n\np2");

      const skills = await loadCustomSkills(testDir);

      expect(Object.keys(skills).length).toBe(2);
      expect(skills.skill1).toBeDefined();
      expect(skills.skill2).toBeDefined();
    });
  });

  describe("buildSkillPrompt", () => {
    it("should include base system prompt", () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill);

      expect(prompt).toContain(skill.systemPrompt);
    });

    it("should include active files", () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill, {
        files: ["src/main.ts", "src/util.ts"],
      });

      expect(prompt).toContain("src/main.ts");
      expect(prompt).toContain("src/util.ts");
    });

    it("should include repo map", () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill, {
        repoMap: "src/\n  main.ts\n  util.ts",
      });

      expect(prompt).toContain("Repository Structure");
      expect(prompt).toContain("main.ts");
    });
  });
});
