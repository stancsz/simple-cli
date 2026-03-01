# AWS Multi-Region Deployment Guide

This document provides guidelines and Terraform snippets to deploy the Simple-CLI Helm chart across multiple AWS regions using AWS Global Accelerator and Route 53.

## Architecture

1.  **EKS Clusters**: Run one EKS cluster per region (e.g., `us-east-1` and `eu-west-1`).
2.  **Ingress**: Use `external-dns` combined with AWS Route 53 or AWS Global Accelerator for global routing.
3.  **Global Accelerator**: Routes traffic to the closest healthy endpoint.

## Terraform Snippets

### Route 53 Latency-Based Routing
To deploy latency-based routing, define Route 53 records pointing to each regional Load Balancer.

```hcl
resource "aws_route53_record" "agency_global" {
  for_each = var.regions

  zone_id = aws_route53_zone.primary.zone_id
  name    = "api.agency.global"
  type    = "A"

  set_identifier = each.key

  alias {
    name                   = aws_lb.regional[each.key].dns_name
    zone_id                = aws_lb.regional[each.key].zone_id
    evaluate_target_health = true
  }

  latency_routing_policy {
    region = each.key
  }
}
```

### AWS Global Accelerator
If you require static IP addresses and faster failover, use Global Accelerator.

```hcl
resource "aws_globalaccelerator_accelerator" "agency" {
  name            = "agency-global-accelerator"
  ip_address_type = "IPV4"
  enabled         = true
}

resource "aws_globalaccelerator_listener" "https" {
  accelerator_arn = aws_globalaccelerator_accelerator.agency.id
  client_affinity = "SOURCE_IP"
  protocol        = "TCP"

  port_range {
    from_port = 443
    to_port   = 443
  }
}

resource "aws_globalaccelerator_endpoint_group" "regional" {
  for_each = var.regions

  listener_arn          = aws_globalaccelerator_listener.https.id
  endpoint_group_region = each.key

  endpoint_configuration {
    endpoint_id                    = aws_lb.regional[each.key].arn
    client_ip_preservation_enabled = true
    weight                         = 100
  }
}
```

### VPC Peering
If your components require direct communication across regions, configure VPC Peering.

```hcl
resource "aws_vpc_peering_connection" "cross_region" {
  vpc_id        = aws_vpc.us_east.id
  peer_vpc_id   = aws_vpc.eu_west.id
  peer_region   = "eu-west-1"
  auto_accept   = false

  tags = {
    Name = "us-east-to-eu-west-peering"
  }
}

resource "aws_vpc_peering_connection_accepter" "cross_region_accepter" {
  provider                  = aws.eu_west
  vpc_peering_connection_id = aws_vpc_peering_connection.cross_region.id
  auto_accept               = true

  tags = {
    Name = "eu-west-accepter"
  }
}
```

### Cross-Region S3 Buckets for Data Sync
Create buckets for the replication sidecar to sync the `Brain` and `CompanyContext` data securely.

```hcl
resource "aws_s3_bucket" "multi_region_backup" {
  bucket = "agency-multi-region-backup"
}

resource "aws_s3_bucket_versioning" "multi_region_backup_versioning" {
  bucket = aws_s3_bucket.multi_region_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_replication_configuration" "replication" {
  role   = aws_iam_role.replication.arn
  bucket = aws_s3_bucket.multi_region_backup.id

  rule {
    id     = "SyncBrainAndContext"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.multi_region_backup_replica.arn
      storage_class = "STANDARD"
    }
  }
}
```

## Helm Chart Configuration

Once the infrastructure is set up, configure your `values.yaml` for the multi-region helm deployment:

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
```
