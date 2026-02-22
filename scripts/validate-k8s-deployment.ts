import { execSync } from 'child_process';
import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';

const CLUSTER_NAME = 'simple-cli-test';
const IMAGE_NAME = 'simple-agency:local';
const NAMESPACE = 'showcase-corp';
const CHART_DIR = 'deployment/chart/simple-cli';
const TEST_VALUES = join(CHART_DIR, 'values-test.yaml');
const BIN_DIR = join(process.cwd(), '.bin');

function run(cmd: string, ignoreError = false) {
    try {
        console.log(`> ${cmd}`);
        execSync(cmd, { stdio: 'inherit', env: process.env });
    } catch (e: any) {
        if (!ignoreError) {
            console.error(`Error running command: ${cmd}`);
            process.exit(1);
        }
    }
}

function runWithOutput(cmd: string): string {
    console.log(`> ${cmd}`);
    return execSync(cmd, { env: process.env }).toString().trim();
}

function ensureBinaries() {
    if (!existsSync(BIN_DIR)) {
        mkdirSync(BIN_DIR, { recursive: true });
    }

    // Add BIN_DIR to PATH for subsequent commands
    process.env.PATH = `${BIN_DIR}:${process.env.PATH}`;

    const platform = process.platform;
    const arch = process.arch === 'x64' ? 'amd64' : process.arch; // Simplified mapping

    if (platform !== 'linux' && platform !== 'darwin') {
        console.warn("Auto-install of binaries only supported on Linux/macOS. Assuming binaries are in PATH.");
        return;
    }

    // Kind
    try {
        execSync('which kind', { stdio: 'ignore' });
    } catch {
        console.log("Installing Kind...");
        const url = `https://kind.sigs.k8s.io/dl/v0.24.0/kind-${platform}-${arch}`;
        execSync(`curl -Lo ${join(BIN_DIR, 'kind')} ${url}`);
        chmodSync(join(BIN_DIR, 'kind'), '755');
    }

    // Kubectl
    try {
        execSync('which kubectl', { stdio: 'ignore' });
    } catch {
        console.log("Installing Kubectl...");
        // Use stable version retrieval logic or hardcode a recent version
        const url = `https://dl.k8s.io/release/v1.31.0/bin/${platform}/${arch}/kubectl`;
        execSync(`curl -Lo ${join(BIN_DIR, 'kubectl')} ${url}`);
        chmodSync(join(BIN_DIR, 'kubectl'), '755');
    }

    // Helm
    try {
        execSync('which helm', { stdio: 'ignore' });
    } catch {
        console.log("Installing Helm...");
        execSync(`curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | HELM_INSTALL_DIR=${BIN_DIR} bash`);
    }
}

async function main() {
    console.log("🚀 Starting Kubernetes Validation Pipeline...");

    // 1. Check/Install Dependencies
    console.log("\n--- Checking Dependencies ---");
    ensureBinaries();

    const deps = ['kind', 'docker', 'kubectl', 'helm'];
    for (const dep of deps) {
        try {
            runWithOutput(`which ${dep}`);
        } catch {
            console.error(`❌ Dependency missing: ${dep}`);
            process.exit(1);
        }
    }

    // 2. Setup Kind Cluster
    console.log("\n--- Setting up Kind Cluster ---");
    try {
        const clusters = runWithOutput(`kind get clusters`);
        if (clusters.includes(CLUSTER_NAME)) {
            console.log(`Cluster ${CLUSTER_NAME} already exists.`);
        } else {
            run(`kind create cluster --name ${CLUSTER_NAME}`);
        }
    } catch (e) {
        console.error("Failed to check/create cluster:", e);
        process.exit(1);
    }

    // 3. Build Docker Image
    console.log("\n--- Building Docker Image ---");
    run(`docker build -t ${IMAGE_NAME} .`);

    // 4. Load Image into Kind
    console.log("\n--- Loading Image into Kind ---");
    run(`kind load docker-image ${IMAGE_NAME} --name ${CLUSTER_NAME}`);

    // 5. Deploy Helm Chart
    console.log("\n--- Deploying Helm Chart ---");
    // Ensure namespace exists
    try {
        run(`kubectl create namespace ${NAMESPACE}`, true);
    } catch {}

    // Install/Upgrade
    run(`helm upgrade --install simple-cli ${CHART_DIR} -f ${TEST_VALUES} --namespace ${NAMESPACE} --create-namespace`);

    // 6. Wait for Pods
    console.log("\n--- Waiting for Pods ---");
    try {
        run(`kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=simple-cli --namespace ${NAMESPACE} --timeout=300s`);
    } catch (e) {
        console.error("Timeout waiting for pods.");
        run(`kubectl get pods -n ${NAMESPACE}`, true);
        run(`kubectl logs -l app.kubernetes.io/name=simple-cli -n ${NAMESPACE} --all-containers=true --tail=20`, true);
        process.exit(1);
    }

    // 7. Run Validation Inside Pod
    console.log("\n--- Running Validation Inside Pod ---");
    // Find the pod name
    const podName = runWithOutput(`kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=simple-cli -o jsonpath="{.items[0].metadata.name}"`);
    console.log(`Target Pod: ${podName}`);

    // Verify file exists in pod or copy it
    try {
        run(`kubectl exec -n ${NAMESPACE} ${podName} -- ls /app/scripts/k8s-init-showcase.js`);
    } catch {
        console.warn("Script not found in image (maybe build context issue?). Copying it manually...");
        run(`kubectl cp scripts/k8s-init-showcase.js ${NAMESPACE}/${podName}:/app/scripts/k8s-init-showcase.js`);
    }

    // Execute script
    try {
        run(`kubectl exec -n ${NAMESPACE} ${podName} -- node /app/scripts/k8s-init-showcase.js`);
    } catch (e) {
        console.error("❌ In-pod validation failed.");
        run(`kubectl logs -n ${NAMESPACE} ${podName} --all-containers=true`, true);
        process.exit(1);
    }

    // 8. Verify Persistence
    console.log("\n--- Verifying Persistence ---");
    // Delete the pod to simulate restart
    run(`kubectl delete pod ${podName} -n ${NAMESPACE}`);
    console.log("Waiting for new pod...");
    run(`kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=simple-cli --namespace ${NAMESPACE} --timeout=300s`);

    const newPodName = runWithOutput(`kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/name=simple-cli -o jsonpath="{.items[0].metadata.name}"`);
    console.log(`New Pod: ${newPodName}`);

    // Check if context file still exists
    try {
        run(`kubectl exec -n ${NAMESPACE} ${newPodName} -- ls /app/.agent/companies/showcase-corp/config/company_context.json`);
        console.log("✅ Persistence verified: Company context exists after restart.");
    } catch {
        console.error("❌ Persistence check failed: Company context missing.");
        process.exit(1);
    }

    // 9. Cleanup (Optional)
    if (process.env.SKIP_CLEANUP) {
        console.log("\n⚠️ Skipping cleanup as requested.");
    } else {
        console.log("\n--- Cleanup ---");
        run(`kind delete cluster --name ${CLUSTER_NAME}`);
    }

    console.log("\n🎉🎉🎉 VALIDATION SUCCESSFUL 🎉🎉🎉");
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
