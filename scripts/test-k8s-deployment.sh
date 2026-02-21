#!/bin/bash
set -e

# Configuration
IMAGE_NAME="simple-agency:latest"
RELEASE_NAME="e2e-test"
NAMESPACE="default"
CHART_DIR="./deployment/chart"

echo "🚀 Starting Kubernetes End-to-End Test..."

# 1. Check Prerequisites
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl could not be found"
    exit 1
fi

if ! command -v helm &> /dev/null; then
    echo "❌ helm could not be found"
    exit 1
fi

# Detect Cluster (Minikube vs Kind vs Other)
echo "🔍 Detecting Kubernetes cluster..."
CURRENT_CONTEXT=$(kubectl config current-context)
echo "   Context: $CURRENT_CONTEXT"

# 2. Build Docker Image
echo "🔨 Building Docker image..."
docker build -t $IMAGE_NAME .

# 3. Load Image into Cluster
if [[ "$CURRENT_CONTEXT" == "minikube" ]]; then
    echo "📦 Loading image into Minikube..."
    minikube image load $IMAGE_NAME
elif [[ "$CURRENT_CONTEXT" == "kind-"* ]]; then
    echo "📦 Loading image into Kind..."
    kind load docker-image $IMAGE_NAME
else
    echo "⚠️  Not Minikube/Kind. Assuming image is available or pushed."
fi

# 4. Install Helm Chart
echo "⛵ Installing Helm chart..."
# Uninstall if exists
helm uninstall $RELEASE_NAME -n $NAMESPACE 2>/dev/null || true
# Wait a bit for cleanup
sleep 5

helm install $RELEASE_NAME $CHART_DIR \
    --namespace $NAMESPACE \
    --set image.repository="simple-agency" \
    --set image.tag="latest" \
    --set image.pullPolicy="IfNotPresent" \
    --set company="e2e-corp"

# 5. Wait for Pods
echo "⏳ Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=$RELEASE_NAME-agent -n $NAMESPACE --timeout=300s
kubectl wait --for=condition=ready pod -l app=$RELEASE_NAME-brain -n $NAMESPACE --timeout=300s

echo "✅ Pods are ready!"

# 6. Port Forwarding (Background)
echo "🔌 Setting up port forwarding..."
# Find Pod Names
AGENT_POD=$(kubectl get pod -l app=$RELEASE_NAME-agent -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")
BRAIN_POD=$(kubectl get pod -l app=$RELEASE_NAME-brain -n $NAMESPACE -o jsonpath="{.items[0].metadata.name}")

# Kill any existing forwards on these ports
pkill -f "kubectl port-forward" || true

# Forward Agent (3000 -> 3000) and Health Monitor (3004 -> 3004)
kubectl port-forward $AGENT_POD 3000:3000 -n $NAMESPACE > /dev/null 2>&1 &
PF_PID_1=$!
kubectl port-forward $AGENT_POD 3004:3004 -n $NAMESPACE > /dev/null 2>&1 &
PF_PID_2=$!

# Forward Brain (3002 -> 3002)
kubectl port-forward $BRAIN_POD 3002:3002 -n $NAMESPACE > /dev/null 2>&1 &
PF_PID_3=$!

echo "   Forwarded ports: 3000, 3002, 3004"
sleep 5 # Wait for forwards to establish

# 7. Run Validation Tests
echo "🧪 Running Integration Tests (Live K8s Mode)..."
export TEST_K8S=true
export BRAIN_URL="http://localhost:3002/sse"
export AGENT_URL="http://localhost:3000"
export HEALTH_URL="http://localhost:3004/sse"
export COMPANY_URL="http://localhost:3000"

# Use set +e to capture exit code without terminating script
set +e
npm test tests/integration/production_validation.test.ts
TEST_EXIT_CODE=$?
set -e

# 8. Run Internal Showcase Job
echo "🎬 Running Internal Showcase Job..."
kubectl run showcase-job \
    --image=$IMAGE_NAME \
    --image-pull-policy=IfNotPresent \
    --restart=Never \
    --env="JULES_AGENT_DIR=/app/.agent" \
    --command -- node demos/simple-cli-showcase/run_demo.js

echo "   Waiting for job completion..."
kubectl wait --for=condition=complete job/showcase-job -n $NAMESPACE --timeout=300s || {
    echo "❌ Job failed or timed out. Logs:"
    kubectl logs job/showcase-job -n $NAMESPACE
    # Don't fail the whole script solely on this if the test passed, but usually we want both.
    TEST_EXIT_CODE=1
}

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ Showcase Job logs:"
    kubectl logs job/showcase-job -n $NAMESPACE | tail -n 20
fi

# 9. Cleanup
echo "🧹 Cleaning up..."
kill $PF_PID_1 $PF_PID_2 $PF_PID_3 || true
helm uninstall $RELEASE_NAME -n $NAMESPACE
kubectl delete job showcase-job -n $NAMESPACE || true

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS: Kubernetes E2E Test Passed!"
    exit 0
else
    echo "❌ FAILURE: Tests failed."
    exit 1
fi
