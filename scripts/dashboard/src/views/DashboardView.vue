<template>
  <div>
    <div id="summary-panel" class="panel">
        <h2>Operational Summary (Sarah_DevOps)</h2>
        <div id="summary-text" :class="{ loading: !summary }">{{ summary || 'Generating summary...' }}</div>
    </div>

    <div class="grid">
        <SystemHealthPanel :healthData="systemData" />
        <FinancialKPIsPanel :financialData="financialData" />
    </div>

    <div class="grid-full">
        <SwarmFleetPanel :fleetData="fleetData" />
    </div>

    <div class="grid">
        <div class="panel">
            <h3>Task Completion & Success Rate</h3>
            <Bar v-if="tasksChartData" :data="tasksChartData" :options="chartOptions" />
        </div>
        <div class="panel">
            <h3>Estimated Costs (USD)</h3>
            <Doughnut v-if="costsChartData" :data="costsChartData" />
        </div>
    </div>

    <div class="panel" v-if="showcaseRuns.length > 0">
         <h3>Showcase Validation History</h3>
         <table id="showcase-table">
             <thead>
                 <tr>
                     <th>Status</th>
                     <th>Timestamp</th>
                     <th>Duration (ms)</th>
                     <th>Steps</th>
                     <th>Artifacts</th>
                 </tr>
             </thead>
             <tbody>
                 <tr v-for="run in showcaseRuns" :key="run.id">
                     <td :style="{ color: run.success ? 'green' : 'red', fontWeight: 'bold' }">{{ run.success ? 'PASS' : 'FAIL' }}</td>
                     <td>{{ new Date(run.timestamp).toLocaleString() }}</td>
                     <td>{{ run.total_duration_ms }}</td>
                     <td>
                         <ul class="steps-list" style="margin: 0; padding-left: 1em;">
                             <li v-for="step in run.steps" :key="step.name">
                                 <span :style="{ color: step.status === 'success' ? 'green' : 'red' }">●</span> {{ step.name }}
                             </li>
                         </ul>
                     </td>
                     <td>{{ run.artifact_count }}</td>
                 </tr>
             </tbody>
         </table>
    </div>
  </div>
</template>

<script>
import { Bar, Doughnut } from 'vue-chartjs'
import SwarmFleetPanel from '../components/SwarmFleetPanel.vue'
import FinancialKPIsPanel from '../components/FinancialKPIsPanel.vue'
import SystemHealthPanel from '../components/SystemHealthPanel.vue'

export default {
    components: { Bar, Doughnut, SwarmFleetPanel, FinancialKPIsPanel, SystemHealthPanel },
    data() {
        return {
            metrics: {},
            alerts: [],
            showcaseRuns: [],
            summary: null,
            chartOptions: { responsive: true },

            fleetData: [],
            financialData: {},
            systemData: {},
            pollingInterval: null
        }
    },
    computed: {
        validMetrics() {
            const res = {};
            for (const k in this.metrics) {
                if (!this.metrics[k].error) res[k] = this.metrics[k];
            }
            return res;
        },
        tasksChartData() {
            const companies = Object.keys(this.validMetrics);
            if (companies.length === 0) return null;
            return {
                labels: companies,
                datasets: [{
                    label: 'Tasks Completed',
                    data: companies.map(c => this.validMetrics[c].task_count),
                    backgroundColor: '#007bff'
                }, {
                    label: 'Success Rate (%)',
                    data: companies.map(c => this.validMetrics[c].success_rate),
                    backgroundColor: '#28a745',
                    type: 'line'
                }]
            }
        },
        costsChartData() {
            const companies = Object.keys(this.validMetrics);
            if (companies.length === 0) return null;
            return {
                labels: companies,
                datasets: [{
                    data: companies.map(c => this.validMetrics[c].estimated_cost_usd),
                    backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
                }]
            }
        }
    },
    async mounted() {
        await this.loadData();
        this.pollingInterval = setInterval(this.loadData, 30000);
    },
    beforeUnmount() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
    },
    methods: {
        async loadData() {
            try {
                const res = await fetch('/api/dashboard/data');
                const data = await res.json();

                this.fleetData = data.fleet || [];
                this.financialData = data.finance || {};
                this.systemData = data.system || {};

                if (data.system && data.system.metrics) {
                    this.metrics = data.system.metrics;
                }
                if (data.system && data.system.active_alerts) {
                    this.alerts = data.system.active_alerts;
                }

            } catch(e) { console.error("Failed to load dashboard data:", e); }

            if (!this.summary) {
                try {
                    const summaryRes = await fetch('/api/dashboard/summary');
                    const data = await summaryRes.json();
                    this.summary = data.summary;
                } catch (e) {
                    this.summary = "Failed to load summary.";
                }
            }

            try {
                const showcaseRes = await fetch('/api/dashboard/showcase-runs');
                this.showcaseRuns = await showcaseRes.json();
            } catch (e) { console.error(e); }
        }
    }
}
</script>

<style>
.grid-full {
    width: 100%;
    margin-bottom: 20px;
}
</style>
