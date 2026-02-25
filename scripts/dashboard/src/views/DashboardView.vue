<template>
  <div>
    <div id="summary-panel" class="panel">
        <h2>Operational Summary (Sarah_DevOps)</h2>
        <div id="summary-text" :class="{ loading: !summary }">{{ summary || 'Generating summary...' }}</div>
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

    <div id="alerts-panel" class="panel" v-if="alerts.length > 0">
        <h3>Active Alerts</h3>
        <ul id="alerts-list">
            <li v-for="alert in alerts" :key="alert">{{ alert }}</li>
        </ul>
    </div>

    <div class="panel" v-if="showcaseRuns.length > 0">
         <h3>Showcase Validation</h3>
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

    <div class="panel">
         <h3>Company Details</h3>
         <table id="metrics-table">
             <thead>
                 <tr>
                     <th>Company</th>
                     <th>Tasks</th>
                     <th>Success Rate</th>
                     <th>Avg Duration (ms)</th>
                     <th>Cost (USD)</th>
                 </tr>
             </thead>
             <tbody>
                 <tr v-for="(data, company) in validMetrics" :key="company">
                     <td>{{ company }}</td>
                     <td>{{ data.task_count }}</td>
                     <td>{{ data.success_rate }}%</td>
                     <td>{{ data.avg_duration_ms }}</td>
                     <td>${{ data.estimated_cost_usd }}</td>
                 </tr>
             </tbody>
         </table>
    </div>
  </div>
</template>

<script>
import { Bar, Doughnut } from 'vue-chartjs'

export default {
    components: { Bar, Doughnut },
    data() {
        return {
            metrics: {},
            alerts: [],
            showcaseRuns: [],
            summary: null,
            chartOptions: { responsive: true }
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
    },
    methods: {
        async loadData() {
            try {
                const metricsRes = await fetch('/api/dashboard/metrics');
                this.metrics = await metricsRes.json();
            } catch (e) { console.error(e); }

            try {
                const alertsRes = await fetch('/api/dashboard/alerts');
                const data = await alertsRes.json();
                this.alerts = data.alerts || [];
            } catch (e) { console.error(e); }

            try {
                const summaryRes = await fetch('/api/dashboard/summary');
                const data = await summaryRes.json();
                this.summary = data.summary;
            } catch (e) {
                this.summary = "Failed to load summary.";
            }

            try {
                const showcaseRes = await fetch('/api/dashboard/showcase-runs');
                this.showcaseRuns = await showcaseRes.json();
            } catch (e) { console.error(e); }
        }
    }
}
</script>
