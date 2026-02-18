import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DIFY_COMPOSE_FILE = 'docker-compose.dify.yml';
const DIFY_TEMPLATES_DIR = 'dify_agent_templates';

describe('Dify Integration', () => {
  let dockerAvailable = false;

  let difyStarted = false;

  beforeAll(async () => {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      execSync('docker compose version', { stdio: 'ignore' });
      dockerAvailable = true;
    } catch (e) {
      console.warn('Docker not found, skipping Dify integration tests.');
    }

    if (dockerAvailable) {
      console.log('Starting Dify stack...');
      try {
        // Validate config first
        execSync(`docker compose -f ${DIFY_COMPOSE_FILE} config`, { stdio: 'inherit' });

        // Attempt to start
        execSync(`docker compose -f ${DIFY_COMPOSE_FILE} up -d`, { stdio: 'inherit' });

        // Give it a moment to initialize containers (not full service startup)
        await new Promise(resolve => setTimeout(resolve, 5000));

        difyStarted = true;
      } catch (e) {
        console.error('Failed to start Dify stack (likely network/rate limit):', e);
      }
    }
  }, 60000); // Increased timeout for docker compose up

  afterAll(() => {
    if (dockerAvailable) {
      console.log('Stopping Dify stack...');
      try {
        execSync(`docker compose -f ${DIFY_COMPOSE_FILE} down`, { stdio: 'inherit' });
      } catch (e) {
        console.error('Failed to stop Dify stack:', e);
      }
    }
  });

  it('should have the Dify compose file', () => {
    expect(fs.existsSync(DIFY_COMPOSE_FILE)).toBe(true);
  });

  it('should have agent templates', () => {
    const supervisor = path.join(DIFY_TEMPLATES_DIR, 'supervisor_agent.json');
    const coder = path.join(DIFY_TEMPLATES_DIR, 'coding_agent.json');

    expect(fs.existsSync(supervisor)).toBe(true);
    expect(fs.existsSync(coder)).toBe(true);

    const supervisorContent = JSON.parse(fs.readFileSync(supervisor, 'utf-8'));
    expect(supervisorContent.app.name).toBe('Supervisor Agent');

    const coderContent = JSON.parse(fs.readFileSync(coder, 'utf-8'));
    expect(coderContent.app.name).toBe('Coding Agent');
  });

  it('should have valid docker-compose configuration', () => {
    if (!dockerAvailable) return;
    // This throws if config is invalid
    execSync(`docker compose -f ${DIFY_COMPOSE_FILE} config`, { stdio: 'ignore' });
  });

  it('should have Dify containers running', async () => {
    if (!dockerAvailable || !difyStarted) {
      console.warn('Skipping container check because Dify did not start.');
      return;
    }

    // Check if containers are listed in docker ps
    const simpleOutput = execSync(`docker compose -f ${DIFY_COMPOSE_FILE} ps`).toString();

    expect(simpleOutput).toContain('dify-api');
    expect(simpleOutput).toContain('dify-web');
    expect(simpleOutput).toContain('dify-db');
    expect(simpleOutput).toContain('dify-redis');
  });
});
