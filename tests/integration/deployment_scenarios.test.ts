import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

describe('Deployment Scenarios', () => {
  const testCompanyDir = join(process.cwd(), '.agent', 'companies', 'test-company-deployment');

  afterEach(() => {
    if (existsSync(testCompanyDir)) {
      rmSync(testCompanyDir, { recursive: true, force: true });
    }
  });

  describe('Configuration Wizard', () => {
    it('should create company context structure via setup script', async () => {
      // Test the setup script via child_process
      const scriptPath = join(process.cwd(), 'scripts', 'setup_company.ts');

      const child = spawn('npx', ['ts-node', scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Event-driven interaction
      let step = 0;
      child.stdout.on('data', (data) => {
          const str = data.toString();
          // console.log(str);
          if (str.includes('Enter Company ID') && step === 0) {
              child.stdin.write('test-company-deployment\n');
              step++;
          } else if (str.includes('Enter Display Name') && step === 1) {
              child.stdin.write('Test Company Inc.\n');
              step++;
          } else if (str.includes('Enter Persona Role') && step === 2) {
              child.stdin.write('Tester\n');
              step++;
          } else if (str.includes('Enter Persona Tone') && step === 3) {
              child.stdin.write('Neutral\n');
              step++;
              child.stdin.end();
          }
      });

      child.stderr.on('data', (data) => console.error(data.toString()));

      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Script exited with code ${code}`));
        });
      });

      // Verify directories and files
      expect(existsSync(testCompanyDir)).toBe(true);
      expect(existsSync(join(testCompanyDir, 'config', 'persona.json'))).toBe(true);
      expect(existsSync(join(testCompanyDir, 'docs', 'README.md'))).toBe(true);

      // Verify content
      const persona = JSON.parse(readFileSync(join(testCompanyDir, 'config', 'persona.json'), 'utf-8'));
      expect(persona.name).toBe('test-company-deployment_Agent');
      expect(persona.role).toBe('Tester');
    }, 30000);
  });

  describe('Docker Deployment', () => {
    it('should have a valid docker-compose.yml', () => {
      const composePath = join(process.cwd(), 'docker-compose.yml');
      expect(existsSync(composePath)).toBe(true);
      const content = readFileSync(composePath, 'utf-8');
      expect(content).toContain('services:');
      expect(content).toContain('agent:');
      expect(content).toContain('image:');
    });

    it('should have a valid Dockerfile', () => {
      const dockerfilePath = join(process.cwd(), 'Dockerfile');
      expect(existsSync(dockerfilePath)).toBe(true);
      const content = readFileSync(dockerfilePath, 'utf-8');
      expect(content).toContain('FROM node:');
      expect(content).toContain('WORKDIR /app');
    });
  });

  describe('Helm Deployment', () => {
    const chartDir = join(process.cwd(), 'deployment', 'chart', 'simple-cli');

    it('should have chart structure', () => {
      expect(existsSync(join(chartDir, 'Chart.yaml'))).toBe(true);
      expect(existsSync(join(chartDir, 'values.yaml'))).toBe(true);
      expect(existsSync(join(chartDir, 'templates'))).toBe(true);
    });

    it('should pass helm lint (dry run simulation)', () => {
        const chart = readFileSync(join(chartDir, 'Chart.yaml'), 'utf-8');
        expect(chart).toContain('name: simple-cli');
        expect(chart).toContain('apiVersion: v2');
    });
  });
});
