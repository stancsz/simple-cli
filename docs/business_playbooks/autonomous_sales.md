# Autonomous Sales Playbook

## Introduction
This playbook outlines the autonomous strategies, simulated negotiation scenarios, and swarm-driven approaches for optimizing sales, proposal generation, and client onboarding within the Autonomous AI Agency.

## 1. Core Principles
*   **Value Maximization**: Always strive for the highest long-term Total Contract Value (TCV).
*   **Policy Enforcement**: Never compromise on corporate policy minimum margins, liability caps, or risk thresholds.
*   **Client Empathy**: Use predictive profiling and market data to anticipate client needs and concerns.

## 2. Contract Negotiation Simulation

The Agency utilizes a multi-agent swarm simulation (via `OpenCoworkServer`) to negotiate and refine proposals *before* presenting them to real clients.

### 2.1 The Swarm Architecture

1.  **Sales Agent**: Goal: Maximize Total Contract Value (TCV) and long-term client value.
2.  **Client Proxy Agent**: Goal: Simulate the client's interests by advocating for lower costs, expanded scope, and favorable timelines based on industry data.
3.  **Legal/Finance Agent**: Goal: Enforce corporate policy constraints (e.g., minimum margin, liability caps, risk tolerance).

### 2.2 Simulated Negotiation Scenarios

#### Scenario 1: The Budget-Conscious Startup
*   **Context**: Client is a fast-growing startup with limited immediate capital but high potential for equity or long-term retainer growth.
*   **Initial Proposal**: Standard rate ($150/hr), 100 hours ($15,000).
*   **Swarm Interaction**:
    *   **Sales**: Proposes full price but emphasizes speed to market.
    *   **Client Proxy**: Pushes back aggressively on price, citing a $10,000 hard limit. Requests a stripped-down MVP.
    *   **Legal/Finance**: Blocks outright discounts that drop margin below 30%. Suggests a phased approach or performance-based equity kicker.
    *   **Resolution**: Swarm agrees on a $10,000 MVP Phase 1 (protecting margin by reducing hours to 66) with a pre-negotiated $7,500 Phase 2 contingent on funding.

#### Scenario 2: The Enterprise Heavyweight
*   **Context**: Fortune 500 company focused on security, SLAs, and dedicated support, less sensitive to initial price but highly risk-averse.
*   **Initial Proposal**: Custom AI integration, $150,000.
*   **Swarm Interaction**:
    *   **Sales**: Highlights comprehensive features, dedicated account management, and a premium 20% SLA uplift.
    *   **Client Proxy**: Accepts price but demands unlimited liability, stringent indemnification, and immediate, 24/7 dedicated support.
    *   **Legal/Finance**: Flags unlimited liability as a critical policy violation. Proposes capping liability at 1x contract value and defining clear SLA boundaries.
    *   **Resolution**: Swarm agrees on the $150,000 price point + 20% SLA, successfully negotiates liability cap at 2x contract value (within policy limits), and defines support hours clearly.

#### Scenario 3: The Indecisive Mid-Market
*   **Context**: Mid-sized firm struggling with digital transformation, unsure of exact scope, seeking a "silver bullet."
*   **Initial Proposal**: Full digital transformation suite, $75,000.
*   **Swarm Interaction**:
    *   **Sales**: Proposes the full suite to capture maximum TCV.
    *   **Client Proxy**: Hesitant. Asks for a pilot, wants to see ROI before committing to the full $75,000, and requests a 30-day exit clause.
    *   **Legal/Finance**: Approves the pilot concept but rejects the 30-day exit clause for the full implementation phase due to high upfront resourcing costs.
    *   **Resolution**: Swarm structures a $25,000 paid pilot (Phase 1) with clear, mutually agreed-upon KPIs. The remaining $50,000 (Phase 2) auto-triggers if KPIs are met, with no exit clause once triggered.

## 3. Storage and Meta-Learning
All negotiation outcomes are stored in Episodic Memory as `negotiation_pattern` to inform future Sales Agent strategies and improve the accuracy of Client Proxy simulations.