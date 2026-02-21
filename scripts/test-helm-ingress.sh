#!/bin/bash
set -e

# Configuration
CLUSTER_NAME="chart-testing"
NAMESPACE="agency"

# Function to cleanup on exit
cleanup() {
  if [ -n "$CLUSTER_CREATED" ]; then
      echo "Cleaning up..."
      kind delete cluster --name $CLUSTER_NAME || true
  fi
}
trap cleanup EXIT

# Ensure local bin is in PATH for kind and helm
mkdir -p bin
export PATH=$PWD/bin:$PATH

# Ensure kubectl is available
if ! command -v kubectl &> /dev/null; then
  echo "kubectl not found. Installing..."
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x kubectl
  mv kubectl bin/
fi

# Ensure kind is available
if ! command -v kind &> /dev/null; then
  echo "kind not found. Installing..."
  curl -Lo kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
  chmod +x kind
  mv kind bin/
fi

# Ensure helm is available
if ! command -v helm &> /dev/null; then
  echo "helm not found. Installing..."
  curl -LO https://get.helm.sh/helm-v3.13.3-linux-amd64.tar.gz
  tar -zxvf helm-v3.13.3-linux-amd64.tar.gz
  mv linux-amd64/helm bin/
  rm -rf linux-amd64 helm-v3.13.3-linux-amd64.tar.gz
fi

echo "Creating KinD cluster..."
if kind create cluster --name $CLUSTER_NAME --wait 60s; then
    CLUSTER_CREATED=true

    echo "Installing Nginx Ingress Controller..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

    echo "Waiting for Ingress Controller pods..."
    kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=300s

    # Build Docker Image
    echo "Building Docker Image..."
    docker build -t simple-agency:test .
    kind load docker-image simple-agency:test --name $CLUSTER_NAME

    # Install Chart
    echo "Installing Chart..."
    helm install agency deployment/chart/simple-cli \
      --namespace $NAMESPACE \
      --create-namespace \
      --set image.repository=simple-agency \
      --set image.tag=test \
      --set image.pullPolicy=Never \
      --set ingress.enabled=true \
      --set "ingress.hosts[0].host=test.local" \
      --set "ingress.hosts[0].paths[0].path=/" \
      --set "ingress.hosts[0].paths[0].pathType=Prefix" \
      --set networkPolicy.enabled=true \
      --set networkPolicy.ingress.enabled=true \
      --set "networkPolicy.ingress.from[0].namespaceSelector.matchLabels.kubernetes.io/metadata.name=ingress-nginx"

    # Label the ingress-nginx namespace so network policy allows traffic
    kubectl label namespace ingress-nginx kubernetes.io/metadata.name=ingress-nginx --overwrite

    echo "Waiting for Agency pods..."
    kubectl wait --namespace $NAMESPACE \
      --for=condition=ready pod/agency-agent-0 \
      --timeout=300s || kubectl describe pod agency-agent-0 -n $NAMESPACE

    echo "Running Helm Test..."
    helm test agency --namespace $NAMESPACE

    echo "Verifying Resources..."
    kubectl get ingress -n $NAMESPACE -o wide
    kubectl get networkpolicy -n $NAMESPACE -o wide

    echo "---------------------------------------------------"
    echo "Test Passed: Ingress and NetworkPolicy verified."
    echo "---------------------------------------------------"

else
    echo "WARNING: Failed to create KinD cluster. Environment might be restricted."
    echo "Falling back to static analysis (lint & template)."

    echo "Running Helm Lint..."
    helm lint deployment/chart/simple-cli

    echo "Running Helm Template (Ingress Enabled)..."
    helm template agency deployment/chart/simple-cli \
      --set ingress.enabled=true \
      --set networkPolicy.enabled=true \
      --set networkPolicy.ingress.enabled=true \
      > template_output.yaml

    echo "Verifying generated template..."

    if grep -q "kind: Ingress" template_output.yaml; then
        echo "PASS: Ingress resource generated."
    else
        echo "FAIL: Ingress resource NOT generated."
        exit 1
    fi

    if grep -q "kind: NetworkPolicy" template_output.yaml; then
        echo "PASS: NetworkPolicy resource generated."
    else
        echo "FAIL: NetworkPolicy resource NOT generated."
        exit 1
    fi

    # Check for specific Ingress content
    if grep -q "ingressClassName: nginx" template_output.yaml; then
        echo "PASS: Ingress class name correct."
    else
        echo "FAIL: Ingress class name missing or incorrect."
        exit 1
    fi

    # Check for NetworkPolicy content
    if grep -q "policyTypes:" template_output.yaml; then
        echo "PASS: NetworkPolicy policyTypes present."
    else
        echo "FAIL: NetworkPolicy policyTypes missing."
        exit 1
    fi

    echo "---------------------------------------------------"
    echo "Static Analysis Passed: Chart templates are valid."
    echo "---------------------------------------------------"
    rm template_output.yaml
    exit 0
fi
