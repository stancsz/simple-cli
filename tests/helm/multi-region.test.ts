import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const execFileAsync = promisify(execFile);

describe("Helm Chart: Multi-Region Deployment", () => {
    let testRoot: string;
    let renderedYaml: string;
    const CHART_PATH = "deployment/chart/simple-cli";

    beforeAll(async () => {
        testRoot = await mkdtemp(join(tmpdir(), "multi-region-helm-test-"));

        try {
            await execFileAsync("helm", ["version"]);
        } catch (e) {
            console.warn("Helm not found, skipping rendering.");
            return;
        }

        const valuesFile = join(testRoot, "values-multi-region.yaml");
        await writeFile(valuesFile, `
multiRegion:
  enabled: true
  regions:
    - name: us-east-1
      nodeSelector:
        topology.kubernetes.io/region: us-east-1
      storageClass: gp3-us-east
    - name: eu-west-1
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
`);

        const { stdout } = await execFileAsync("helm", ["template", "mr-test", CHART_PATH, "-f", valuesFile]);
        renderedYaml = stdout;
    });

    afterAll(async () => {
        if (testRoot) {
            await rm(testRoot, { recursive: true, force: true });
        }
    });

    it("should render StatefulSets for each region", () => {
        if (!renderedYaml) return;
        expect(renderedYaml).toContain("name: mr-test-agent-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-agent-eu-west-1");
    });

    it("should render Ingress for each region and global", () => {
        if (!renderedYaml) return;
        expect(renderedYaml).toContain("name: mr-test-ingress-us-east-1");
        expect(renderedYaml).toContain("name: mr-test-ingress-eu-west-1");
        expect(renderedYaml).toContain("name: mr-test-ingress-multiregion");
    });

    it("should configure correct storage classes per region", () => {
        if (!renderedYaml) return;
        expect(renderedYaml).toContain("storageClassName: gp3-us-east");
        expect(renderedYaml).toContain("storageClassName: gp3-eu-west");
    });
});
