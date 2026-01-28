/**
 * Tests for skills system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

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
} from '../src/skills.js';

describe('skills', () => {
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

  describe('builtinSkills', () => {
    it('should have code skill', () => {
      expect(builtinSkills.code).toBeDefined();
      expect(builtinSkills.code.name).toBe('code');
    });

    it('should have architect skill', () => {
      expect(builtinSkills.architect).toBeDefined();
      expect(builtinSkills.architect.name).toBe('architect');
    });

    it('should have ask skill', () => {
      expect(builtinSkills.ask).toBeDefined();
      expect(builtinSkills.ask.name).toBe('ask');
    });

    it('should have all expected skills', () => {
      const skillNames = Object.keys(builtinSkills);
      expect(skillNames).toContain('code');
      expect(skillNames).toContain('architect');
      expect(skillNames).toContain('ask');
      expect(skillNames).toContain('help');
      expect(skillNames).toContain('test');
      expect(skillNames).toContain('debug');
      expect(skillNames).toContain('refactor');
      expect(skillNames).toContain('review');
      expect(skillNames).toContain('shell');
      expect(skillNames).toContain('git');
    });

    it('should have system prompts for all skills', () => {
      for (const skill of Object.values(builtinSkills)) {
        expect(skill.systemPrompt).toBeTruthy();
        expect(skill.systemPrompt.length).toBeGreaterThan(50);
      }
    });

    it('should have descriptions for all skills', () => {
      for (const skill of Object.values(builtinSkills)) {
        expect(skill.description).toBeTruthy();
      }
    });
  });

  describe('getActiveSkill', () => {
    it('should return code skill by default', () => {
      const skill = getActiveSkill();
      expect(skill.name).toBe('code');
    });

    it('should return skill from environment', () => {
      process.env.SIMPLE_CLI_SKILL = 'architect';
      const skill = getActiveSkill();
      expect(skill.name).toBe('architect');
    });

    it('should fallback to code for invalid skill', () => {
      process.env.SIMPLE_CLI_SKILL = 'invalid';
      const skill = getActiveSkill();
      expect(skill.name).toBe('code');
    });
  });

  describe('setActiveSkill', () => {
    it('should set valid skill', () => {
      const skill = setActiveSkill('test');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test');
      expect(process.env.SIMPLE_CLI_SKILL).toBe('test');
    });

    it('should return undefined for invalid skill', () => {
      const skill = setActiveSkill('invalid');
      expect(skill).toBeUndefined();
    });

    it('should update getActiveSkill', () => {
      setActiveSkill('debug');
      const active = getActiveSkill();
      expect(active.name).toBe('debug');
    });
  });

  describe('listSkills', () => {
    it('should return all skills', () => {
      const skills = listSkills();
      expect(skills.length).toBe(Object.keys(builtinSkills).length);
    });

    it('should return skill objects', () => {
      const skills = listSkills();
      for (const skill of skills) {
        expect(skill.name).toBeTruthy();
        expect(skill.systemPrompt).toBeTruthy();
      }
    });
  });

  describe('loadSkillFromFile', () => {
    it('should load valid skill file', async () => {
      const skillPath = join(testDir, 'custom.json');
      const customSkill: Skill = {
        name: 'custom',
        description: 'A custom skill',
        systemPrompt: 'You are a custom assistant.',
        tools: ['readFiles'],
      };
      await writeFile(skillPath, JSON.stringify(customSkill));

      const loaded = await loadSkillFromFile(skillPath);

      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('custom');
      expect(loaded?.systemPrompt).toBe('You are a custom assistant.');
    });

    it('should return null for invalid file', async () => {
      const skillPath = join(testDir, 'invalid.json');
      await writeFile(skillPath, '{ invalid json');

      const loaded = await loadSkillFromFile(skillPath);
      expect(loaded).toBeNull();
    });

    it('should return null for missing required fields', async () => {
      const skillPath = join(testDir, 'incomplete.json');
      await writeFile(skillPath, JSON.stringify({ name: 'incomplete' }));

      const loaded = await loadSkillFromFile(skillPath);
      expect(loaded).toBeNull();
    });

    it('should return null for non-existent file', async () => {
      const loaded = await loadSkillFromFile(join(testDir, 'nonexistent.json'));
      expect(loaded).toBeNull();
    });
  });

  describe('saveSkillToFile', () => {
    it('should save skill to file', async () => {
      const skillPath = join(testDir, 'saved.json');
      const skill: Skill = {
        name: 'saved',
        description: 'A saved skill',
        systemPrompt: 'Saved prompt',
      };

      await saveSkillToFile(skill, skillPath);
      const loaded = await loadSkillFromFile(skillPath);

      expect(loaded?.name).toBe('saved');
    });
  });

  describe('loadCustomSkills', () => {
    it('should load all skills from directory', async () => {
      await writeFile(
        join(testDir, 'skill1.json'),
        JSON.stringify({ name: 'skill1', description: 'd1', systemPrompt: 'p1' })
      );
      await writeFile(
        join(testDir, 'skill2.json'),
        JSON.stringify({ name: 'skill2', description: 'd2', systemPrompt: 'p2' })
      );

      const skills = await loadCustomSkills(testDir);

      expect(Object.keys(skills).length).toBe(2);
      expect(skills.skill1).toBeDefined();
      expect(skills.skill2).toBeDefined();
    });

    it('should skip non-JSON files', async () => {
      await writeFile(join(testDir, 'readme.md'), '# Readme');
      await writeFile(
        join(testDir, 'valid.json'),
        JSON.stringify({ name: 'valid', description: 'd', systemPrompt: 'p' })
      );

      const skills = await loadCustomSkills(testDir);

      expect(Object.keys(skills).length).toBe(1);
    });

    it('should return empty for non-existent directory', async () => {
      const skills = await loadCustomSkills(join(testDir, 'nonexistent'));
      expect(Object.keys(skills).length).toBe(0);
    });
  });

  describe('buildSkillPrompt', () => {
    it('should include base system prompt', () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill);

      expect(prompt).toContain(skill.systemPrompt);
    });

    it('should include active files', () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill, {
        files: ['src/main.ts', 'src/util.ts'],
      });

      expect(prompt).toContain('src/main.ts');
      expect(prompt).toContain('src/util.ts');
    });

    it('should include repo map', () => {
      const skill = builtinSkills.code;
      const prompt = buildSkillPrompt(skill, {
        repoMap: 'src/\n  main.ts\n  util.ts',
      });

      expect(prompt).toContain('Repository Structure');
      expect(prompt).toContain('main.ts');
    });
  });
});
