# LLM Caching

To reduce operational costs and improve latency for repetitive tasks or swarms, the Digital Biosphere implements an LLM caching layer. The caching system is configurable and supports both file-based and Redis-backed storage mechanisms.

## Architecture

The `LLMCache` interface defines the core contract for cache interactions: `get` and `set`. It utilizes a SHA-256 hash of the full system prompt (including the persona logic) and the user's conversation history to generate a unique key.

When `LLM.generate()` is called:
1. It reads `mcp.json` or `.agent/config.json` to load the `llmCache` settings.
2. If `yoloMode` is enabled or streaming (`onTyping`) is requested, the cache is **bypassed** entirely. YOLO mode disables caching to prevent autonomous operations from making decisions based on potentially stale contextual data.
3. On a cache hit, the response object is returned immediately, and an `llm_cache_hit` metric is logged (along with `llm_tokens_total_cached`).
4. On a cache miss, an `llm_cache_miss` metric is logged, the LLM API is queried, and the successful parsed result is then asynchronously cached.

## Configuration Options

Update your `mcp.json` (or `.agent/config.json` per project) to configure caching:

```json
{
  "llmCache": {
    "enabled": true,
    "ttl": 86400,
    "backend": "file"
  }
}
```

### Parameters:
- `enabled` (boolean): Master switch to toggle caching.
- `ttl` (number): Time-to-live for cache entries in seconds. Defaults to `86400` (24 hours).
- `backend` (string): Either `"file"` or `"redis"`.
  - `"file"`: Stores JSON files under `.agent/cache/llm/`.
  - `"redis"`: Connects to a Redis cluster using the `REDIS_URL` environment variable. Defaults to `redis://localhost:6379` if not provided.

### Redis Configuration Example

```json
{
  "llmCache": {
    "enabled": true,
    "ttl": 86400,
    "backend": "redis"
  }
}
```

*Note: Ensure the `REDIS_URL` environment variable is set if your Redis instance requires authentication or is hosted remotely (e.g., `REDIS_URL="redis://user:password@host:port"`).*

## Metrics & Health Monitoring

The caching system exposes several new metrics to the Health Monitor MCP (`get_health_report` and `get_company_metrics`):
- `llm_cache_hit`: Total count of successful cache retrievals.
- `llm_cache_miss`: Total count of cache misses.
- `llm_cache_size`: The size of the cached LLM response payload in bytes.
- `llm_tokens_total_cached`: The number of tokens that would have been consumed had the cache not hit.
- `estimated_savings_usd`: The estimated cost savings based on cached tokens (assuming a standard $5.00/1M tokens rate).

These metrics are critical for evaluating the efficiency of standard operating procedures (SOPs) and assessing the ROI of the caching infrastructure.

## Performance Benchmarks

In synthetic benchmark tests (`tests/integration/llm_cache_validation.test.ts`), simulating a repeated scenario where an LLM prompt is executed 5 times:
- **Without caching:** 5 discrete API calls, consuming 500 tokens.
- **With caching:** 1 API call, 4 cache hits, consuming only 100 tokens. Total savings of 400 tokens (an 80% reduction in token cost and equivalent reduction in latency for repeated tasks).
