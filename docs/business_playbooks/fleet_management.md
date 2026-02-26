# Swarm Fleet Management Playbook

## Overview
This playbook defines the operating procedures for monitoring, evaluating, and scaling the fleet of autonomous client swarms (companies). The goal is to optimize resource allocation across all active clients based on real-time demand and profitability metrics.

## Core Concepts

### 1. Active Swarm
An "Active Swarm" is defined as a Linear Project that is not in a 'Completed' state. Each project corresponds to a client engagement.

### 2. Demand Metrics
- **Pending Issues:** The number of open issues in the Linear project.
- **Threshold:** A configurable limit (default: 5) that triggers a "High Demand" signal.

### 3. Profitability Metrics
- **Recent Revenue:** The sum of authorized Xero invoices for the client in the last 30 days.
- **Weighting:** The algorithm balances Demand vs. Profitability to prioritize high-value clients during resource contention.

## Fleet Evaluation Algorithm

The `evaluate_fleet_demand` tool performs the following:
1.  **Discovery:** Fetches all active Linear projects.
2.  **Data Gathering:**
    - Queries Linear for issue counts.
    - Queries Xero for recent revenue (matching Project Name to Contact Name).
3.  **Scoring:**
    - `Demand Score`: Normalized based on issue count vs. threshold.
    - `Revenue Score`: Normalized based on revenue magnitude.
    - `Total Score`: `(Demand Score * (1 - Weight)) + (Revenue Score * Weight)`
4.  **Recommendation:**
    - `scale_up`: If issues >= threshold.
    - `scale_down`: If issues == 0.
    - `maintain`: Otherwise.

## Operational Workflow

### Daily Fleet Check
1.  **Status Check:** Run `get_fleet_status` to view the health of all swarms.
2.  **Evaluation:** Run `evaluate_fleet_demand` to generate scaling recommendations.
3.  **Balancing:** Run `balance_fleet_resources` with the output from step 2 to execute scaling actions (spawn/terminate agents).

### Configuration
- `demand_threshold`: Adjust in `evaluate_fleet_demand` (default: 5).
- `profitability_weight`: Adjust in `evaluate_fleet_demand` (default: 0.5).

## Tools Reference
- `get_fleet_status`: Overview of active swarms.
- `evaluate_fleet_demand`: Analysis and recommendations.
- `balance_fleet_resources`: Execution of scaling actions.
