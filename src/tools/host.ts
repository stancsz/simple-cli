/**
 * Host Tool - Manages global persistent memory and identity
 * Stores data in ~/.simple/memory.json
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Tool } from '../registry.js';

// Input schema
export const inputSchema = z.object({
  action: z.enum(['learn', 'recall', 'forget', 'reflect']).describe('Action to perform'),
  content: z.string().optional().describe('Content to learn, recall, or forget'),
  category: z.enum(['user_fact', 'project_fact', 'persona']).optional().default('user_fact').describe('Category of memory'),
});

type HostInput = z.infer<typeof inputSchema>;

interface HostMemory {
  user_facts: string[];
  project_facts: Record<string, string[]>;
  persona_evolution: string[];
  meta: {
    last_run: number;
    interaction_count: number;
  };
}

const MEMORY_DIR = join(homedir(), '.simple');
const MEMORY_FILE = join(MEMORY_DIR, 'memory.json');

async function loadMemory(): Promise<HostMemory> {
  if (!existsSync(MEMORY_FILE)) {
    return {
      user_facts: [],
      project_facts: {},
      persona_evolution: [],
      meta: { last_run: Date.now(), interaction_count: 0 }
    };
  }
  try {
    const content = await readFile(MEMORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      user_facts: [],
      project_facts: {},
      persona_evolution: [],
      meta: { last_run: Date.now(), interaction_count: 0 }
    };
  }
}

async function saveMemory(memory: HostMemory): Promise<void> {
  if (!existsSync(MEMORY_DIR)) {
    await mkdir(MEMORY_DIR, { recursive: true });
  }
  memory.meta.last_run = Date.now();
  await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

export async function execute(input: HostInput): Promise<string> {
  const { action, content, category } = inputSchema.parse(input);
  const memory = await loadMemory();

  // Update interaction count on every call
  memory.meta.interaction_count++;

  switch (action) {
    case 'learn': {
      if (!content) return 'Error: Content required for learning.';

      if (category === 'user_fact') {
        if (!memory.user_facts.includes(content)) {
          memory.user_facts.push(content);
          await saveMemory(memory);
          return `Learned user fact: "${content}"`;
        }
        return `I already know: "${content}"`;
      } else if (category === 'persona') {
        memory.persona_evolution.push(content);
        await saveMemory(memory);
        return `Persona updated: "${content}"`;
      } else if (category === 'project_fact') {
        const cwd = process.cwd();
        if (!memory.project_facts[cwd]) memory.project_facts[cwd] = [];
        memory.project_facts[cwd].push(content);
        await saveMemory(memory);
        return `Learned project fact for ${cwd}: "${content}"`;
      }
      return 'Error: Invalid category.';
    }

    case 'recall': {
      if (!content) {
        // Return summary
        const cwd = process.cwd();
        return JSON.stringify({
          user_facts: memory.user_facts.slice(-10),
          persona: memory.persona_evolution.slice(-5),
          project_facts: memory.project_facts[cwd] || [],
          meta: memory.meta
        }, null, 2);
      }

      const query = content.toLowerCase();
      const cwd = process.cwd();
      const results = [
        ...memory.user_facts.filter(f => f.toLowerCase().includes(query)).map(f => `[User] ${f}`),
        ...memory.persona_evolution.filter(f => f.toLowerCase().includes(query)).map(f => `[Persona] ${f}`),
        ...(memory.project_facts[cwd] || []).filter(f => f.toLowerCase().includes(query)).map(f => `[Project] ${f}`)
      ];

      if (results.length === 0) return `No memories found for "${content}".`;
      return `Recalled:\n- ${results.join('\n- ')}`;
    }

    case 'forget': {
      if (!content) return 'Error: Content required to forget.';

      let deleted = false;

      // User Facts
      const initialUserCount = memory.user_facts.length;
      memory.user_facts = memory.user_facts.filter(f => !f.includes(content));
      if (memory.user_facts.length < initialUserCount) deleted = true;

      // Persona
      const initialPersonaCount = memory.persona_evolution.length;
      memory.persona_evolution = memory.persona_evolution.filter(f => !f.includes(content));
      if (memory.persona_evolution.length < initialPersonaCount) deleted = true;

      // Project Facts (current CWD)
      const cwd = process.cwd();
      if (memory.project_facts[cwd]) {
          const initialProjectCount = memory.project_facts[cwd].length;
          memory.project_facts[cwd] = memory.project_facts[cwd].filter(f => !f.includes(content));
          if (memory.project_facts[cwd].length < initialProjectCount) deleted = true;
      }

      if (deleted) {
        await saveMemory(memory);
        return `Forgot memories containing "${content}".`;
      }
      return `Nothing found to forget for "${content}".`;
    }

    case 'reflect': {
      // Pruning or summarizing logic could go here
      // For now, just return a deep reflection
      return `Memory Status:\nFacts: ${memory.user_facts.length}\nInteractions: ${memory.meta.interaction_count}`;
    }

    default:
      return 'Unknown action.';
  }
}

export const tool: Tool = {
  name: 'host',
  description: 'Host Agent Memory. Use this to learn facts about the user, update your persona, or recall past interactions. This memory persists across sessions.',
  inputSchema,
  permission: 'write',
  execute: async (args) => execute(args as HostInput),
};
