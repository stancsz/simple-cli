1. **Extend Brain MCP (`src/mcp_servers/brain/tools.ts`)**
   - Create `src/mcp_servers/brain/tools/forecasting_integration.ts` and add `record_strategic_metric` and `query_forecasting_insights`.
   - Update `src/mcp_servers/brain/index.ts` to register these new tools.

2. **Update Corporate Strategy Schema (`src/brain/schemas.ts`)**
   - Modify `CorporateStrategy` to include `forecasting_references?: string[];`.

3. **Enhance Business Ops MCP (`src/mcp_servers/business_ops/tools.ts`)**
   - Modify `forecast_resource_demand` in `src/mcp_servers/business_ops/tools.ts` to call Brain's `query_forecasting_insights` tool in addition to/instead of directly calling the forecasting server, integrating it with the strategy. Or update it so that it pulls forecasting data via Brain if that is the intent. *Wait, the prompt says: "Business Ops tools like forecast_resource_demand should internally call this Brain tool to ensure consistency."*

4. **Create SOP (`sops/forecasting_integration_workflow.md`)**
   - Document how forecasting data flows from recording to strategic decision-making.

5. **Update Documentation (`docs/ROADMAP.md` & `docs/BRAIN_MCP.md`)**
   - Mark "Integration" under Phase 29 as in progress and add notes about the new Brain MCP tools.

6. **Create Integration Tests (`tests/integration/forecasting_brain_integration.test.ts`)**
   - Mock Brain MCP and Forecasting Server.
   - Test `record_strategic_metric` and `query_forecasting_insights`.
   - Test that `forecast_resource_demand` calls the Brain tool.

7. **Pre-commit Instructions**
   - Ensure proper testing, verifications, reviews and reflections are done.
