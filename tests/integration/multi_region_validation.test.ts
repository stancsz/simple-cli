import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

describe("Phase 27 Validation: Multi-Region High Availability & Failover", () => {
    let testRoot: string;
    let renderedYaml: string;
    const CHART_PATH = "deployment/chart/simple-cli";

    beforeAll(async () => {
        testRoot = await mkdtemp(join(tmpdir(), "multi-region-validation-"));

        const valuesFile = join(testRoot, "values-multi-region.yaml");
        await writeFile(valuesFile, `
multiRegion:
  enabled: true
  regions:
    - name: us-east-1
      active: true
      nodeSelector:
        topology.kubernetes.io/region: us-east-1
      storageClass: gp3-us-east
    - name: eu-west-1
      active: true
      nodeSelector:
        topology.kubernetes.io/region: eu-west-1
      storageClass: gp3-eu-west
ingress:
  enabled: true
  hosts:
    - host: api.agency.global
      paths:
        - path: /
          pathType: Prefix

failoverController:
  enabled: true

replicationSidecar:
  enabled: true

agent:
  persistence:
    enabled: true
brain:
  persistence:
    enabled: true
  service:
    type: LoadBalancer
`);

        const { stdout } = await execFileAsync("helm", ["template", "mr-test", CHART_PATH, "-f", valuesFile]);
        renderedYaml = stdout;
    });

    afterAll(async () => {
        if (testRoot) {
            await rm(testRoot, { recursive: true, force: true });
        }
    });

    it("should render Failover Controller deployment", () => {
        expect(renderedYaml).toContain("name: mr-test-simple-cli-failover-controller");
        expect(renderedYaml).toContain("curl -m 5 -s -o /dev/null -w \"%{http_code}\" http://mr-test-agent-us-east-1");
        expect(renderedYaml).toContain("curl -m 5 -s -o /dev/null -w \"%{http_code}\" http://mr-test-agent-eu-west-1");
    });

    it("should render StatefulSets per region with correct constraints and labels", () => {
        // Agent StatefulSets
        expect(renderedYaml).toContain("name: mr-test-agent-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-agent-eu-west-1");

        // Brain StatefulSets
        expect(renderedYaml).toContain("name: mr-test-brain-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-brain-eu-west-1");

        // Verify NodeSelectors
        expect(renderedYaml).toContain("topology.kubernetes.io/region: us-east-1");
        expect(renderedYaml).toContain("topology.kubernetes.io/region: eu-west-1");

        // Verify TopologySpreadConstraints
        expect(renderedYaml).toContain("topologyKey: topology.kubernetes.io/zone");
        expect(renderedYaml).toContain("maxSkew: 1");
    });

    it("should render Services and Ingress per region", () => {
        // Services
        expect(renderedYaml).toContain("name: mr-test-agent-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-agent-eu-west-1");
        expect(renderedYaml).toContain("name: mr-test-brain-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-brain-eu-west-1");

        // Global ingress
        expect(renderedYaml).toContain("name: mr-test-ingress-multiregion");
    });

    it("should render isolated PVCs with region-specific storage classes", () => {
        // PVCs
        expect(renderedYaml).toContain("name: mr-test-agent-pvc-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-agent-pvc-eu-west-1");
        expect(renderedYaml).toContain("name: mr-test-brain-pvc-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-brain-pvc-eu-west-1");

        // StorageClasses
        expect(renderedYaml).toContain("storageClassName: gp3-us-east");
        expect(renderedYaml).toContain("storageClassName: gp3-eu-west");
    });

    it("should configure custom exec readiness probes for failover simulation", () => {
        // Readiness probe reading failedRegions
        expect(renderedYaml).toContain("/etc/config/failedRegions");
        expect(renderedYaml).toContain("if grep -q us-east-1");
        expect(renderedYaml).toContain("if grep -q eu-west-1");
    });

    it("should attach replication sidecars to Agent and Brain StatefulSets", () => {
        // Replication sidecar present in agent and brain
        expect(renderedYaml).toContain("name: replication-sidecar");
        expect(renderedYaml).toContain("Syncing agent storage for region us-east-1");
        expect(renderedYaml).toContain("Syncing brain storage for region us-east-1");
    });
});
