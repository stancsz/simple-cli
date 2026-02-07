/**
 * Memory Tool - Unified Persistent Memory Management
 * Consolidates functionality from host, claw_brain, knowledge, and memory tools.
 */

import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Tool } from '../registry.js';

// --- Storage Paths ---
const GLOBAL_MEMORY_PATH = join(homedir(), '.simple', 'memory.json');

function getProjectMemoryPath() {
  return join(process.cwd(), '.simple', 'project_memory.json');
}

function getMissionPath() {
  return join(process.cwd(), '.simple', 'mission.json');
}

function getKVPath() {
  return join(process.cwd(), '.simple', 'kv.json');
}

// --- Types ---

interface GlobalMemory {
  user_facts: string[];
  persona_evolution: string[];
  meta: { last_run: number; interaction_count: number };
}

interface ProjectMemory {
  facts: string[];
  patterns: string[]; // Technical patterns/knowledge
  meta: { last_updated: number };
}

interface MissionState {
  goal: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  reflections: string[];
  last_updated: number;
}

interface KVStore {
  entries: Record<string, any>;
}

// --- Helper Functions ---

async function loadGlobalMemory(): Promise<GlobalMemory> {
  if (!existsSync(GLOBAL_MEMORY_PATH)) {
    return { user_facts: [], persona_evolution: [], meta: { last_run: Date.now(), interaction_count: 0 } };
  }
  try {
    return JSON.parse(await readFile(GLOBAL_MEMORY_PATH, 'utf-8'));
  } catch {
    return { user_facts: [], persona_evolution: [], meta: { last_run: Date.now(), interaction_count: 0 } };
  }
}

async function saveGlobalMemory(data: GlobalMemory) {
  await mkdir(dirname(GLOBAL_MEMORY_PATH), { recursive: true });
  data.meta.last_run = Date.now();
  await writeFile(GLOBAL_MEMORY_PATH, JSON.stringify(data, null, 2));
}

async function loadProjectMemory(): Promise<ProjectMemory> {
  const path = getProjectMemoryPath();
  if (!existsSync(path)) {
    return { facts: [], patterns: [], meta: { last_updated: Date.now() } };
  }
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return { facts: [], patterns: [], meta: { last_updated: Date.now() } };
  }
}

async function saveProjectMemory(data: ProjectMemory) {
  const path = getProjectMemoryPath();
  await mkdir(dirname(path), { recursive: true });
  data.meta.last_updated = Date.now();
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function loadMission(): Promise<MissionState> {
  const path = getMissionPath();
  if (!existsSync(path)) {
    return { goal: 'Unknown', status: 'planning', reflections: [], last_updated: Date.now() };
  }
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return { goal: 'Unknown', status: 'planning', reflections: [], last_updated: Date.now() };
  }
}

async function saveMission(data: MissionState) {
  const path = getMissionPath();
  await mkdir(dirname(path), { recursive: true });
  data.last_updated = Date.now();
  await writeFile(path, JSON.stringify(data, null, 2));
}

async function loadKV(): Promise<KVStore> {
  const path = getKVPath();
  if (!existsSync(path)) {
    return { entries: {} };
  }
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return { entries: {} };
  }
}

async function saveKV(data: KVStore) {
  const path = getKVPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

// --- Tool Definition ---

export const inputSchema = z.object({
  action: z.enum([
    'learn_fact', 'forget_fact', 'recall', // Global/Project Facts
    'add_pattern', 'search_patterns',      // Project Patterns (Knowledge)
    'mission_set', 'mission_update', 'mission_reflect', // Mission State
    'kv_set', 'kv_get', 'kv_list', 'kv_delete' // Key-Value Store
  ]).describe('Action to perform'),

  content: z.string().optional().describe('Content for facts, patterns, mission reflections, or KV value'),
  key: z.string().optional().describe('Key for KV operations or specific fact identification'),
  category: z.enum(['user', 'project', 'persona']).optional().default('project').describe('Category for facts (user=global, project=local)'),
  status: z.enum(['planning', 'executing', 'completed', 'failed']).optional().describe('Status for mission update'),
});

type MemoryInput = z.infer<typeof inputSchema>;

export const execute = async (args: Record<string, unknown>): Promise<any> => {
  const { action, content, key, category, status } = inputSchema.parse(args);

  switch (action) {
    // --- Facts (Global & Project) ---
    case 'learn_fact': {
      if (!content) throw new Error('Content required for learn_fact');
      if (category === 'user' || category === 'persona') {
        const mem = await loadGlobalMemory();
        const list = category === 'user' ? mem.user_facts : mem.persona_evolution;
        if (!list.includes(content)) {
          list.push(content);
          mem.meta.interaction_count++; // simple increment
          await saveGlobalMemory(mem);
          return `Learned global ${category} fact: "${content}"`;
        }
        return `Already knew global ${category} fact: "${content}"`;
      } else {
        const mem = await loadProjectMemory();
        if (!mem.facts.includes(content)) {
          mem.facts.push(content);
          await saveProjectMemory(mem);
          return `Learned project fact: "${content}"`;
        }
        return `Already knew project fact: "${content}"`;
      }
    }

    case 'forget_fact': {
       if (!content) throw new Error('Content (text to match) required for forget_fact');
       let deleted = false;

       // Try global first
       const globalMem = await loadGlobalMemory();
       const initialUser = globalMem.user_facts.length;
       globalMem.user_facts = globalMem.user_facts.filter(f => !f.includes(content));
       if (globalMem.user_facts.length < initialUser) deleted = true;

       const initialPersona = globalMem.persona_evolution.length;
       globalMem.persona_evolution = globalMem.persona_evolution.filter(f => !f.includes(content));
       if (globalMem.persona_evolution.length < initialPersona) deleted = true;

       if (deleted) await saveGlobalMemory(globalMem);

       // Try project
       const projectMem = await loadProjectMemory();
       const initialProject = projectMem.facts.length;
       projectMem.facts = projectMem.facts.filter(f => !f.includes(content));
       if (projectMem.facts.length < initialProject) {
           deleted = true;
           await saveProjectMemory(projectMem);
       }

       return deleted ? `Forgot facts containing "${content}"` : `No facts found containing "${content}"`;
    }

    case 'recall': {
        const globalMem = await loadGlobalMemory();
        const projectMem = await loadProjectMemory();
        const query = (content || '').toLowerCase();

        const results = [
            ...globalMem.user_facts.filter(f => f.toLowerCase().includes(query)).map(f => `[User] ${f}`),
            ...globalMem.persona_evolution.filter(f => f.toLowerCase().includes(query)).map(f => `[Persona] ${f}`),
            ...projectMem.facts.filter(f => f.toLowerCase().includes(query)).map(f => `[Project] ${f}`),
            ...projectMem.patterns.filter(f => f.toLowerCase().includes(query)).map(f => `[Pattern] ${f}`)
        ];

        if (results.length === 0) return `No memories found matching "${query}"`;
        return `Recalled:\n- ${results.join('\n- ')}`;
    }

    // --- Patterns (Knowledge) ---
    case 'add_pattern': {
        if (!content) throw new Error('Content required for add_pattern');
        const mem = await loadProjectMemory();
        if (!mem.patterns.includes(content)) {
            mem.patterns.push(content);
            await saveProjectMemory(mem);
            return `Added technical pattern: "${content}"`;
        }
        return `Pattern already exists: "${content}"`;
    }

    case 'search_patterns': {
        const mem = await loadProjectMemory();
        const query = (content || '').toLowerCase();
        const matches = mem.patterns.filter(p => p.toLowerCase().includes(query));
        return matches.length > 0 ? `Found patterns:\n- ${matches.join('\n- ')}` : 'No patterns found.';
    }

    // --- Mission ---
    case 'mission_set': {
        if (!content) throw new Error('Content (goal) required for mission_set');
        const mission = await loadMission();
        mission.goal = content;
        mission.status = status || 'planning';
        await saveMission(mission);
        return `Mission goal set: "${content}" (Status: ${mission.status})`;
    }

    case 'mission_update': {
        const mission = await loadMission();
        if (status) mission.status = status;
        if (content) mission.reflections.push(`[Update] ${content}`);
        await saveMission(mission);
        return `Mission updated. Status: ${mission.status}`;
    }

    case 'mission_reflect': {
        if (!content) throw new Error('Content (reflection) required for mission_reflect');
        const mission = await loadMission();
        mission.reflections.push(content);
        // Keep last 50
        if (mission.reflections.length > 50) mission.reflections.shift();
        await saveMission(mission);
        return 'Reflection logged.';
    }

    // --- KV Store ---
    case 'kv_set': {
        if (!key || content === undefined) throw new Error('Key and Content required for kv_set');
        const store = await loadKV();
        store.entries[key] = content;
        await saveKV(store);
        return `KV set: ${key} = ${content}`;
    }

    case 'kv_get': {
        if (!key) throw new Error('Key required for kv_get');
        const store = await loadKV();
        const val = store.entries[key];
        return val !== undefined ? `Value: ${val}` : 'Key not found';
    }

    case 'kv_list': {
        const store = await loadKV();
        return `Keys: ${Object.keys(store.entries).join(', ')}`;
    }

    case 'kv_delete': {
        if (!key) throw new Error('Key required for kv_delete');
        const store = await loadKV();
        if (key in store.entries) {
            delete store.entries[key];
            await saveKV(store);
            return `Deleted key: ${key}`;
        }
        return `Key not found: ${key}`;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

export const tool: Tool = {
  name: 'memory',
  description: 'Unified Persistent Memory Tool. Manages global facts, project knowledge, mission state, and key-value storage.',
  inputSchema,
  permission: 'write',
  execute: async (args) => execute(args as Record<string, unknown>),
};
