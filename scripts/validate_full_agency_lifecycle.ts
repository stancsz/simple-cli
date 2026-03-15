import fs from 'fs';
import path from 'path';
import { EpisodicMemory } from '../src/brain/episodic.js';
import {
    spawnChildAgency,
    mergeChildAgencies,
    retireChildAgency,
    applyEcosystemInsights
} from '../src/mcp_servers/agency_orchestrator/tools/index.js';
import { analyzeEcosystemPatterns } from '../src/mcp_servers/brain/tools/pattern_analysis.js';
import { adjustEcosystemMorphology } from '../src/mcp_servers/brain/tools/ecosystem_evolution.js';
import { generateEcosystemAuditReport } from '../src/mcp_servers/ecosystem_auditor/tools/generate_audit_report.js';
import { assignTaskPredictively } from '../src/mcp_servers/scheduler/tools/task_assignment.js';
import { createLLM } from '../src/llm.js';

export async function runFullLifecycleValidation(shouldCleanup: boolean = true) {
    // Resolve agent directory properly inside the function to pick up env var changes in tests
    const agentDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), '.agent');

    console.log("==========================================================");
    console.log("   Phase 37: Full System Lifecycle Validation Simulation");
    console.log("==========================================================");

    const testCorpMemoryDir = path.join(agentDir, 'companies', 'TestCorp', 'brain');
    await fs.promises.mkdir(testCorpMemoryDir, { recursive: true });

    // 1. Initialize Root Memory (Brain)
    console.log("\n[1] Initializing Core Brain & Company Context...");
    const rootMemoryDir = path.join(agentDir, 'brain');
    await fs.promises.mkdir(rootMemoryDir, { recursive: true });
    const memory = new EpisodicMemory(rootMemoryDir);
    await memory.init();

    // Inject mock company context to simulate onboarding
    await memory.store(
        'CompanyContext_TestCorp',
        'Company Profile',
        JSON.stringify({ name: 'TestCorp', industry: 'E-commerce', goals: ['scale'] }),
        ['company_context', 'TestCorp'],
        'strategy'
    );
    console.log("    -> TestCorp context injected into Brain.");

    // 2. Simulate SOP Execution
    console.log("\n[2] Executing Standard Operating Procedure...");
    // Re-initialize the logger to pick up the JULES_AGENT_DIR correctly within this process
    const { AuditLogger } = await import('../src/mcp_servers/ecosystem_auditor/logger.js');
    // Ensure the instance is recreated or directory is updated to pick up test environment changes
    const localLogger = new (AuditLogger as any)();

    // For validation, we simulate the SOP Engine reading a file and completing a workflow,
    // by explicitly writing an audit log for the execution.
    // This demonstrates the Ecosystem Auditor's capability to track cross-agency comms.
    await localLogger.logEvent({
        event_type: 'communication',
        source_agency: 'root',
        target_agency: 'TestCorp_Swarm',
        description: 'Executed SOP: sops/hello_world.md',
        metadata: { step: 'verify' },
        timestamp: new Date().toISOString()
    });
    console.log("    -> SOP execution audited.");

    // 3. Trigger Ghost Mode (Scheduler Task)
    console.log("\n[3] Triggering Ghost Mode (Scheduling recurring task)...");
    const ghostTaskDir = path.join(agentDir, 'scheduler', 'tasks');
    await fs.promises.mkdir(ghostTaskDir, { recursive: true });
    await fs.promises.writeFile(path.join(ghostTaskDir, 'task_TestCorp.json'), JSON.stringify({
        id: 'task_TestCorp', cron: '* * * * *', action: 'simulate_activity'
    }));

    // We also simulate assigning this task predictively
    await assignTaskPredictively('Run daily client reporting', 'medium');
    console.log("    -> Ghost Mode task scheduled and predictively assigned.");

    // 4. Agency Spawning
    console.log("\n[4] Spawning Child Agency for Sub-Project...");
    const spawnResult = await spawnChildAgency(
        'developer',
        'Handle e-commerce backend development for TestCorp',
        50000,
        { max_agents: 5 },
        memory
    );
    console.log(`    -> Spawned agency: ${spawnResult.agency_id} (${spawnResult.role})`);

    // 5. Meta-Learning & Optimization
    console.log("\n[5] Executing Meta-Learning & Ecosystem Optimization...");
    const llm = createLLM();
    await analyzeEcosystemPatterns(memory, llm);
    console.log("    -> Ecosystem Patterns Analyzed.");

    // Mock ecosystem policy update to be picked up by applyEcosystemInsights
    await memory.store(
        "ecosystem_policy_latest",
        "ecosystem_policy",
        JSON.stringify({
            global_token_budget_modifier: 0.9,
            default_routing_latency_ms: 150,
            max_agents_per_swarm: 5
        }),
        ["ecosystem_policy", "optimization"],
        "strategy"
    );

    const insightsResult = await applyEcosystemInsights(memory);
    console.log(`    -> Ecosystem Insights Applied. Changes applied to: ${insightsResult.changes.length} agencies.`);

    // 6. Ecosystem Morphology Adjustment
    console.log("\n[6] Adjusting Ecosystem Morphology...");
    const mockAgencyStatuses = [
        {
            agency_id: spawnResult.agency_id,
            role: "developer",
            tasks_assigned: 50,
            tasks_failed: 0,
            utilization_rate: 0.95, // High utilization should trigger spawn
            token_efficiency: 0.9,
        }
    ];

    const decisions = await adjustEcosystemMorphology({ agency_statuses: mockAgencyStatuses }, memory);
    console.log(`    -> Morphology adjustments proposed: ${decisions.length}`);
    for(const decision of decisions) {
         console.log(`       - Action: ${decision.action}`);
         // If the decision is to spawn, we simulate it
         if (decision.action === 'spawn') {
             await spawnChildAgency(decision.config?.role || 'assistant', 'Auto-spawned to handle load', 20000, {}, memory);
         }
    }

    // Flush audit logs so they can be read by the report generator
    await new Promise(resolve => setTimeout(resolve, 500));

    // 7. Audit Report Generation
    console.log("\n[7] Generating Ecosystem Audit Report...");
    let reportContent = '';
    // Pass an object matching GenerateEcosystemAuditReportInput which has timeframe
    const result = await generateEcosystemAuditReport({ timeframe: "7_days", focus_area: "all" });
    reportContent = result.summary;
    console.log("    -> Report Generated Successfully.");

    // Save the report explicitly to a file so the test can assert it
    const reportsDir = path.join(agentDir, 'ecosystem_reports');
    await fs.promises.mkdir(reportsDir, { recursive: true });
    await fs.promises.writeFile(path.join(reportsDir, 'latest_report.md'), reportContent);

    // 8. Cleanup Artifacts
    if (shouldCleanup) {
        console.log("\n[8] Cleaning up simulation artifacts...");
        await fs.promises.rm(testCorpMemoryDir, { recursive: true, force: true });
        await fs.promises.rm(ghostTaskDir, { recursive: true, force: true });

        // Remove the spawned child agency directory
        const childAgenciesDir = path.join(agentDir, 'child_agencies');
        if (fs.existsSync(childAgenciesDir)) {
             await fs.promises.rm(childAgenciesDir, { recursive: true, force: true });
        }
    }

    console.log("\n==========================================================");
    console.log("   Validation Simulation Complete.");
    console.log("==========================================================");

    return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runFullLifecycleValidation(true).catch(error => {
        console.error("Validation failed:", error);
        process.exit(1);
    });
}
