import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

describe('Real Kubernetes Validation', () => {
    // Only run if K8S_TEST env var is set
    const shouldRun = process.env.K8S_TEST === 'true' || process.env.K8S_TEST === '1';

    if (!shouldRun) {
        it.skip('skipping real k8s validation (K8S_TEST not set)', () => {});
        return;
    }

    it('should validate deployment on Kind cluster', () => {
        const scriptPath = join(process.cwd(), 'scripts', 'validate-k8s-deployment.ts');
        console.log(`Running validation script: ${scriptPath}`);

        try {
            // Run the script with npx tsx
            execSync(`npx tsx ${scriptPath}`, { stdio: 'inherit' });
        } catch (e: any) {
            console.error("Validation script failed.");
            throw new Error(`Validation script failed with exit code ${e.status}`);
        }
    }, 600000); // 10 minutes timeout
});
