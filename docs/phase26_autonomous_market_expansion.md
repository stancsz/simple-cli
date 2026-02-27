# Phase 26: Autonomous Market Expansion

## Overview
Phase 26 represents the transition from "Optimization" to "Expansion". While Phase 25 established the Corporate Consciousness (Strategy & Governance) and Phase 24 optimized the Economic Engine (Profitability), Phase 26 focuses on autonomously driving **Top-Line Growth**.

The "Growth Engine" will interface with the Corporate Brain to align outreach with high-level strategy, then leverage swarm intelligence to execute complex commercial workflows: from lead generation to proposal creation and contract negotiation.

## Objectives
1.  **Autonomous Lead Generation**: Enhance existing lead gen tools to query `CorporateStrategy` for ideal client profiles (ICP) and conduct targeted, multi-channel outreach.
2.  **Intelligent Proposal Generation**: Build a RAG-based engine that synthesizes client needs (from discovery), agency capabilities (from past projects), and pricing models (from Phase 24) into tailored proposals.
3.  **Contract Negotiation Simulation**: Deploy a specialized swarm to simulate contract negotiations, optimizing terms for profitability (CFO persona) and risk (Legal persona) before presenting to the client.
4.  **Market Positioning Automation**: Continuously analyze the competitive landscape and adjust the agency's public positioning (website copy, case studies) to target "Blue Ocean" opportunities.
5.  **Revenue Growth Validation**: Demonstrate a fully autonomous cycle of: `Strategy -> Lead -> Proposal -> Contract`.

## Implementation Plan

### Deliverable 1: Strategic Lead Generation
**Goal**: Connect the "Corporate Brain" to the "Sales Swarm".
-   **New Tools**:
    -   `get_ideal_client_profile`: Queries Episodic Memory for the latest strategic targets (e.g., "HealthTech Startups").
    -   `score_lead_strategic_fit`: Evaluates potential leads against the Corporate Mission/Vision.
-   **Integration**:
    -   Update `lead_generation_workflow` (Phase 22) to inject `CorporateStrategy` into the qualification logic.

### Deliverable 2: Proposal Generation Engine
**Goal**: Automate the creation of high-quality, winning proposals.
-   **Architecture**:
    -   **Proposal Template Library**: Stored in `docs/business_playbooks/proposals/`.
    -   **RAG Retrieval**: Fetch relevant case studies and team bios from Brain/Linear.
    -   **Pricing Integration**: Call `optimize_pricing_strategy` (Phase 24) to set dynamic rates.
-   **New Tools**:
    -   `generate_proposal_draft`: Assembles the document sections.
    -   `customize_proposal_content`: Tailors language to the specific client's industry and pain points.

### Deliverable 3: Contract Simulation Swarm
**Goal**: Use Game Theory to optimize commercial terms.
-   **Concept**: Before sending a contract, simulate a negotiation between:
    -   **Agent A (The Sales Rep)**: Wants to close the deal (maximize revenue).
    -   **Agent B (The Client Proxy)**: Wants lowest price/highest scope (simulated based on client data).
    -   **Agent C (The CFO/Legal)**: Enforces margin and risk constraints (from Phase 25 Policy).
-   **Output**: A `ContractDraft` that balances win-rate with profitability.
-   **New Tools**:
    -   `simulate_contract_negotiation`: Runs the multi-turn dialogue.
    -   `generate_contract_terms`: Outputs the final legal JSON structure.

## Validation Criteria
-   **Test Suite**: `tests/integration/phase26_growth_validation.test.ts`
-   **Success Metrics**:
    1.  **Alignment**: Leads generated match the `CorporateStrategy` vision > 80%.
    2.  **Quality**: Generated proposals pass a "Supervisor Review" (LLM Quality Gate) for coherence and persuasion.
    3.  **Profitability**: Contract simulations result in terms that satisfy the `Federated Policy` (e.g., > 30% margin).
    4.  **Autonomy**: The full flow from "New Strategy" to "Draft Contract" runs without human intervention in the simulation.
