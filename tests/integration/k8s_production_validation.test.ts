
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppsV1Api, CoreV1Api, KubeConfig, V1StatefulSet, V1PersistentVolumeClaim } from '@kubernetes/client-node';
import { exec } from 'child_process';
import { promisify } from 'util';
import YAML from 'yaml';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);
const CHART_DIR = 'deployment/chart/simple-cli';

// Determine Helm path
const getHelmPath = () => {
  if (existsSync('./bin/helm')) return './bin/helm';
  return 'helm'; // Fallback to global PATH
};

const HELM_BIN = getHelmPath();

// Mock Kubernetes Client
vi.mock('@kubernetes/client-node', () => {
  // Create shared mocks
  const mockApi = {
    createNamespacedStatefulSet: vi.fn(),
    deleteNamespacedStatefulSet: vi.fn(),
    readNamespacedStatefulSet: vi.fn(),
    createNamespacedPersistentVolumeClaim: vi.fn(),
    deleteNamespacedPod: vi.fn(),
    createNamespacedPod: vi.fn(),
    listNamespacedPod: vi.fn(),
  };

  return {
    KubeConfig: vi.fn(() => ({
      loadFromDefault: vi.fn(),
      makeApiClient: vi.fn(() => mockApi), // Return the same mock for all APIs
    })),
    AppsV1Api: vi.fn(),
    CoreV1Api: vi.fn(),
    V1StatefulSet: class {},
    V1PersistentVolumeClaim: class {},
  };
});

describe('Kubernetes Production Validation (Phase 12)', () => {
  let k8sAppsApi: any;
  let k8sCoreApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const kc = new KubeConfig();
    k8sAppsApi = kc.makeApiClient(AppsV1Api);
    k8sCoreApi = kc.makeApiClient(CoreV1Api);
  });

  // Helper to render chart using local Helm
  async function renderChart(companyName: string, namespace: string) {
    const cmd = `${HELM_BIN} template ${companyName} ${CHART_DIR} --namespace ${namespace} --set company="${companyName}" --set image.repository=simple-cli --set image.tag=latest`;
    const { stdout } = await execAsync(cmd);

    // Parse multi-document YAML
    return stdout.split('---').map(doc => {
      try { return YAML.parse(doc); } catch { return null; }
    }).filter(d => d && d.kind);
  }

  // Helper to simulate deployment of a company
  async function deployCompany(companyName: string, namespace: string) {
    const resources = await renderChart(companyName, namespace);

    for (const resource of resources) {
      if (resource.kind === 'PersistentVolumeClaim') {
        await k8sCoreApi.createNamespacedPersistentVolumeClaim(namespace, resource);
      } else if (resource.kind === 'StatefulSet') {
        await k8sAppsApi.createNamespacedStatefulSet(namespace, resource);
      }
    }
    return resources;
  }

  it('1. Validate Multi-Tenant Isolation: Deploy distinct PVCs for acme-corp and beta-llc', async () => {
    const companies = ['acme-corp', 'beta-llc'];

    // Simulate concurrent deployment
    await Promise.all(companies.map(c => deployCompany(c, 'default')));

    // Verify PVC Creation
    // Each company creates 2 PVCs (agent + brain) based on default values
    const calls = k8sCoreApi.createNamespacedPersistentVolumeClaim.mock.calls;
    const pvcNames = calls.map((c: any) => c[1].metadata.name);

    expect(pvcNames).toContain('acme-corp-brain-pvc');
    expect(pvcNames).toContain('beta-llc-brain-pvc');

    // Also check agent PVCs just in case
    expect(pvcNames).toContain('acme-corp-agent-pvc');
    expect(pvcNames).toContain('beta-llc-agent-pvc');

    // Verify Names are distinct (Isolation)
    expect(new Set(pvcNames).size).toBe(4);
  });

  it('2. Validate Sidecar Integration: Agent Pod has Health Monitor and Brain mounts', async () => {
    await deployCompany('acme-corp', 'default');

    expect(k8sAppsApi.createNamespacedStatefulSet).toHaveBeenCalled();
    // We might have multiple StatefulSets (agent + brain). Find the Agent one.
    const calls = k8sAppsApi.createNamespacedStatefulSet.mock.calls;
    const agentSS = calls.find((c: any) => c[1].metadata.name === 'acme-corp-agent')[1];

    expect(agentSS).toBeDefined();

    // Check Containers
    const containerNames = agentSS.spec.template.spec.containers.map((c: any) => c.name);
    expect(containerNames).toContain('agent');
    expect(containerNames).toContain('health-monitor');

    // Check Mounts
    const agentContainer = agentSS.spec.template.spec.containers.find((c: any) => c.name === 'agent');
    const brainMount = agentContainer.volumeMounts.find((m: any) => m.name === 'brain-storage');
    expect(brainMount).toBeDefined();
    expect(brainMount.mountPath).toBe('/app/.agent/brain');

    const healthSidecar = agentSS.spec.template.spec.containers.find((c: any) => c.name === 'health-monitor');
    const agentMount = healthSidecar.volumeMounts.find((m: any) => m.name === 'agent-storage');
    expect(agentMount).toBeDefined();
    expect(agentMount.mountPath).toBe('/app/.agent');
  });

  it('3. Test Persistence: Verify PVC claim persistence across Pod "Restarts"', async () => {
    const company = 'persistence-test';
    const namespace = 'default';
    const pvcName = `${company}-brain-pvc`;

    // Initial Deploy
    await deployCompany(company, namespace);

    // Capture the initial StatefulSet
    const calls = k8sAppsApi.createNamespacedStatefulSet.mock.calls;
    const initialSS = calls.find((c: any) => c[1].metadata.name === `${company}-agent`)[1];
    const initialPVC = initialSS.spec.template.spec.volumes.find((v: any) => v.name === 'brain-storage').persistentVolumeClaim.claimName;
    expect(initialPVC).toBe(pvcName);

    // Simulate "Delete Pod" (Delete StatefulSet in this mock context)
    await k8sAppsApi.deleteNamespacedStatefulSet(company + '-agent', namespace);

    // Simulate "Restart" (Redeploy)
    // Clear mocks to simulate fresh deploy call
    vi.clearAllMocks();
    await deployCompany(company, namespace);

    // Capture the new StatefulSet
    const newCalls = k8sAppsApi.createNamespacedStatefulSet.mock.calls;
    const newSS = newCalls.find((c: any) => c[1].metadata.name === `${company}-agent`)[1];
    const newPVC = newSS.spec.template.spec.volumes.find((v: any) => v.name === 'brain-storage').persistentVolumeClaim.claimName;

    // Verify it uses the SAME PVC name
    expect(newPVC).toBe(pvcName);
    expect(newPVC).toBe(initialPVC);
  });

  it('4. Validate Concurrency: Handle multiple company deployments simultaneously', async () => {
    const companies = Array.from({ length: 5 }, (_, i) => `company-${i}`);

    // Deploy all 5 concurrently
    await Promise.all(companies.map(c => deployCompany(c, 'default')));

    // Each company creates 2 PVCs (brain + agent) and 2 StatefulSets (agent + brain)
    // 5 companies * 2 PVCs = 10 calls
    // 5 companies * 2 SS = 10 calls
    expect(k8sCoreApi.createNamespacedPersistentVolumeClaim).toHaveBeenCalledTimes(10);
    expect(k8sAppsApi.createNamespacedStatefulSet).toHaveBeenCalledTimes(10);

    // Ensure all got distinct PVCs
    const pvcCalls = k8sCoreApi.createNamespacedPersistentVolumeClaim.mock.calls;
    const pvcNames = pvcCalls.map((c: any) => c[1].metadata.name);
    expect(new Set(pvcNames).size).toBe(10);
  });
});
