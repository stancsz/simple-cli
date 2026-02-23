<template>
  <div>
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
            predictions: []
        }
    },
    async mounted() {
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
