# Brain MCP Server

The Brain server acts as the central memory and collective intelligence hub for the agency ecosystem. It manages episodic memories (past actions), semantic knowledge (graphs), and strategic insights.

## Key Capabilities

*   **Episodic Memory**: Stores and retrieves past episodes, allowing agents to learn from historical successes and failures.
*   **Semantic Graph**: Manages relationships between entities, concepts, and agencies.
*   **Strategic Horizon Scanning**: Analyzes market signals and internal metrics to identify opportunities.
*   **Collective Learning**: Syncs standard operating procedures (SOPs) and successful patterns across spawned child agencies.
*   **Cross-Agency Pattern Recognition**: Analyzes activities and memories from multiple child agencies simultaneously to identify ecosystem-wide trends, bottlenecks, and optimization opportunities.

## New Tools (Phase 33)

### `analyze_cross_agency_patterns`
This tool queries the episodic and semantic memories of a given list of child agencies (via their namespaces and `source_agency` metadata). It uses the LLM to synthesize this data into a structured JSON report containing:
*   `summary`: Overall ecosystem health.
*   `common_themes`: Recurring patterns across agencies.
*   `top_performers`: Insights into highly effective strategies.
*   `emerging_risks`: Potential ecosystem-wide issues.
*   `recommended_actions`: Steps the root agency should take to optimize the swarm.

## Storage Location
Data is persisted in the `.agent/brain/` directory, using LanceDB for episodic vectors and a JSON-backed graph for semantic data.
