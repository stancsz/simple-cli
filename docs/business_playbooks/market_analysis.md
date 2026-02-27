# Market Analysis Playbook

## Overview

The Market Analysis toolset provides the Economic Engine with external environmental data, enabling it to benchmark against competitors and identify strategic opportunities. It combines simulated market data (for reliable baselines) with LLM-enhanced insights and real-time competitor website analysis.

## Tools

### 1. `collect_market_data`
Generates a comprehensive market report for a specific sector and region. It merges simulated baseline metrics (growth rates, hourly rates) with LLM-generated qualitative insights (trends, regulatory shifts).

**Inputs:**
- `sector`: Target industry (e.g., "SaaS", "AI Agency").
- `region`: Geographic focus (e.g., "US", "Global").
- `query` (Optional): Specific focus area (e.g., "pricing trends").

**Output:**
JSON object containing:
- `market_growth_rate`
- `average_hourly_rates`
- `key_trends`
- `competitor_density`
- `analysis`: Qualitative insights from the LLM.

### 2. `analyze_competitor_pricing`
Scrapes and analyzes competitor websites to extract pricing models, service offerings, and value propositions.

**Features:**
- **Caching**: Results are stored in the Brain (Episodic Memory) to prevent redundant scraping. Default cache validity is 7 days.
- **Resiliency**: Uses timeouts and error handling to degrade gracefully if a site is unreachable.
- **Structure**: Converts raw HTML to Markdown and uses an LLM to extract structured JSON data.

**Inputs:**
- `competitor_urls`: Array of URLs to analyze.
- `force_refresh` (Optional): Boolean to bypass cache.

**Output:**
Array of `CompetitorAnalysis` objects:
- `pricing_model`
- `extracted_offerings` (Plan, Price, Features)
- `value_proposition`
- `strengths` / `weaknesses`

## Integration with Economic Engine

1. **Quarterly Optimization Cycle**:
   - The `collect_market_data` tool is called to set the baseline for the quarter.
   - `analyze_competitor_pricing` is run on a watchlist of key competitors.

2. **Pricing Optimization**:
   - The output from these tools feeds directly into the `optimize_pricing_strategy` tool, allowing it to recommend prices that are competitive yet profitable.

3. **Service Adjustment**:
   - Gap analysis from competitor offerings helps the `adjust_service_offerings` tool identify missing features or bundles.

## Data Privacy & Compliance

- **Public Data Only**: The tool only accesses public-facing URLs.
- **User-Agent**: Requests identify themselves as "MarketBot/1.0".
- **Rate Limiting**: Sequential processing is used to avoid overwhelming target servers (though simulated in the current implementation, the structure supports this).
