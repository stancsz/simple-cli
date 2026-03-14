<template>
  <div>


      <div class="panel">
          <h3>Ecosystem Insights & Swarm Configurations</h3>

          <div v-if="correlation" style="margin-bottom: 20px; padding: 15px; background-color: #e6f2ff; border-left: 5px solid #0066cc; border-radius: 4px;">
              <h4 style="margin-top: 0; color: #004488;">Meta-Learning Correlation</h4>
              <p style="margin: 0 0 10px 0;"><strong>Status:</strong> {{ correlation.message }}</p>
              <div style="display: flex; gap: 20px;">
                  <div><strong>Task Time:</strong> <span style="color: green;">{{ correlation.task_completion_time_change }}</span></div>
                  <div><strong>Costs:</strong> <span style="color: green;">{{ correlation.cost_reduction }}</span></div>
              </div>
          </div>

          <div v-if="policies.length === 0 && configs.length === 0">No meta-learning insights applied yet.</div>

          <div v-if="policies.length > 0">
              <h4>Recent Ecosystem Policies (Version History)</h4>
              <ul style="list-style-type: none; padding-left: 0;">
                  <li v-for="(policy, index) in policies" :key="policy.id" style="margin-bottom: 10px; border: 1px solid #eee; padding: 10px; border-radius: 4px;">
                      <div style="font-weight: bold; margin-bottom: 5px; color: #555;">Version {{ policies.length - index }} - {{ new Date(policy.timestamp).toLocaleString() }}</div>
                      <pre style="white-space: pre-wrap; font-size: 0.9em; background: #f9f9f9; padding: 8px; border-radius: 4px; border-left: 3px solid #6c757d; margin: 0;">{{ policy.content }}</pre>
                  </li>
              </ul>
          </div>

          <div v-if="configs.length > 0">
              <h4>Active Swarm Configurations</h4>
              <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                      <tr style="background-color: #f4f4f4; text-align: left;">
                          <th style="padding: 8px; border-bottom: 2px solid #ddd;">Agency ID</th>
                          <th style="padding: 8px; border-bottom: 2px solid #ddd;">Last Updated</th>
                          <th style="padding: 8px; border-bottom: 2px solid #ddd;">Configuration Details</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr v-for="config in configs" :key="config.id" style="border-bottom: 1px solid #eee;">
                          <td style="padding: 8px;"><strong>{{ config.id.replace('swarm_config:', '') }}</strong></td>
                          <td style="padding: 8px; color: #666;">{{ new Date(config.timestamp).toLocaleString() }}</td>
                          <td style="padding: 8px;"><pre style="white-space: pre-wrap; margin: 0; font-size: 0.85em; background: #fafafa; padding: 4px;">{{ config.content }}</pre></td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </div>


      <div class="panel">
          <h2>Predictive Intelligence</h2>
          <p>Real-time anomaly detection and metric forecasting.</p>
      </div>

      <div class="grid">
          <div class="panel">
              <h3>Correlated Incidents</h3>
              <div v-if="incidents.length === 0">No active incidents.</div>
              <div v-else v-for="inc in incidents" :key="inc.id" class="incident" :class="inc.severity">
                  <h4>{{ inc.severity.toUpperCase() }}: {{ inc.summary }}</h4>
                  <p>{{ new Date(inc.timestamp).toLocaleString() }}</p>
                  <ul>
                      <li v-for="alert in inc.alerts" :key="alert.timestamp">
                          {{ alert.message }}
                      </li>
                  </ul>
              </div>
          </div>

          <div class="panel">
              <h3>Anomaly Detection</h3>
              <div v-if="anomalies.length === 0">No anomalies detected.</div>
               <table v-else>
                  <thead>
                      <tr>
                          <th>Time</th>
                          <th>Metric</th>
                          <th>Value</th>
                          <th>Z-Score</th>
                          <th>Severity</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr v-for="a in anomalies" :key="a.timestamp + a.metric">
                          <td>{{ new Date(a.timestamp).toLocaleTimeString() }}</td>
                          <td>{{ a.metric }}</td>
                          <td>{{ a.value.toFixed(2) }}</td>
                          <td>{{ a.z_score.toFixed(2) }}</td>
                          <td :class="a.severity">{{ a.severity }}</td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </div>

      <div class="panel">
           <h3>Metric Forecast (Next 60 mins)</h3>
           <div v-if="predictions.length === 0">Insufficient data for predictions.</div>
           <table v-else>
               <thead>
                   <tr>
                       <th>Metric</th>
                       <th>Current</th>
                       <th>Predicted</th>
                       <th>Trend</th>
                   </tr>
               </thead>
               <tbody>
                   <tr v-for="p in predictions" :key="p.metric">
                       <td>{{ p.metric }}</td>
                       <td>{{ p.current_value.toFixed(2) }}</td>
                       <td>{{ p.predicted_value.toFixed(2) }}</td>
                       <td>{{ p.trend }}</td>
                   </tr>
               </tbody>
           </table>
      </div>

      <div class="panel">
          <h3>Anomaly Visualization</h3>
          <AnomalyChart v-if="anomalies.length > 0" :anomalies="anomalies" />
          <div v-else>No data to visualize.</div>
      </div>
  </div>
</template>

<script>
import AnomalyChart from '../components/AnomalyChart.vue'

export default {
    components: { AnomalyChart },
    data() {
        return {
            incidents: [],
            anomalies: [],
            predictions: [],
            policies: [],
            configs: [],
            correlation: null

        }
    },
    async mounted() {
        try {
            const ecoRes = await fetch('/api/dashboard/ecosystem');
            const data = await ecoRes.json();
            this.policies = data.policies || [];
            this.configs = data.configs || [];
            this.correlation = data.correlation || null;
        } catch(e) {}

        try {
            const incRes = await fetch('/api/dashboard/incidents');
            this.incidents = await incRes.json();
        } catch(e) {}

        try {
            const anomRes = await fetch('/api/dashboard/anomalies');
            this.anomalies = await anomRes.json();
        } catch(e) {}

        // Fetch predictions for key metrics if available
        const metrics = [...new Set(this.anomalies.map(a => a.metric))];
        for (const m of metrics) {
             try {
                const predRes = await fetch(`/api/dashboard/predictions?metric=${m}`);
                const data = await predRes.json();
                this.predictions.push(...data);
             } catch(e) {}
        }
    }
}
</script>

<style scoped>
.incident {
    padding: 10px;
    border: 1px solid #ddd;
    margin-bottom: 10px;
    border-radius: 4px;
}
.incident.high { border-left: 5px solid red; background: #ffe6e6; }
.incident.medium { border-left: 5px solid orange; background: #fff5e6; }
.incident.low { border-left: 5px solid yellow; }

td.high { color: red; font-weight: bold; }
td.medium { color: orange; }
</style>
