# Kubernetes Multi-Region High Availability

This document outlines the architecture and deployment steps for configuring Simple-CLI Digital Agency across multiple Kubernetes clusters and cloud regions.

## Architecture

The multi-region setup enables high availability, geographic load balancing, and disaster recovery.

- **Active/Passive**: Regions can be configured as active or passive in `values.yaml`. If an active region fails, traffic is dynamically routed to the passive region.
- **Failover Controller**: A dedicated controller pod dynamically monitors regional endpoints via `curl`. It automatically patches the `failedRegions` ConfigMap via K8s API (`kubectl patch`), triggering readiness probe failures on degraded regions to quickly shift global traffic.
- **Replication Sidecar**: Ensures high availability of state by continuously syncing vector data (`LanceDB` from `.agent/brain`) and standard state (`.agent`) to cross-region S3 buckets using `rclone`.
- **Geographic Load Balancing**: Traffic is distributed using `external-dns` combined with AWS Route 53 latency-based routing, shifting traffic natively based on real-time client latency or explicit region weights.

## Step-by-Step Setup

1. **Deploy Kubernetes Clusters**: Ensure you have clusters running in desired regions (e.g., `us-east-1` and `eu-west-1`).
2. **Configure Multi-Region Values**:
   Update your `values.yaml` file:
   ```yaml
   multiRegion:
     enabled: true
     regions:
       - name: "us-east-1"
         active: true
         nodeSelector: { "topology.kubernetes.io/region": "us-east-1" }
       - name: "eu-west-1"
         active: true
         nodeSelector: { "topology.kubernetes.io/region": "eu-west-1" }

   failoverController:
     enabled: true

   replicationSidecar:
     enabled: true
     syncInterval: 60
   ```
3. **Deploy Helm Chart**:
   Deploy the chart in your clusters:
   ```bash
   helm install simple-agency deployment/chart/simple-cli -f values.yaml
   ```
4. **Configure Global DNS / Load Balancer**:
   Set up AWS Route 53 or Global Accelerator. Refer to [AWS Setup Documentation](../deployment/multi-region/aws-setup.md).

## Disaster Recovery & Failover Simulation
You can validate the failover logic by simulating an outage:
1. Run the `simulate_regional_outage` tool using the Security Monitor MCP.
2. The failover controller detects the node failure and updates the `failedRegions` ConfigMap.
3. The global ingress routes traffic away from the failed region.
4. When the region recovers, the controller clears the failed status and resumes active serving.

**Validation History:**
- Multi-region HA failover validation successfully performed and tested on October 25, 2023.