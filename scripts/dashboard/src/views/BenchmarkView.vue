<template>
  <div class="benchmark-view">
    <h2>Benchmark Results</h2>
    <div v-if="loading">Loading benchmark data...</div>
    <div v-else-if="error">Error loading data: {{ error }}</div>
    <div v-else>
      <div class="summary">
        <p>Last Run: {{ new Date(timestamp).toLocaleString() }}</p>
      </div>

      <div class="charts">
        <div class="chart-container">
          <h3>Token Usage</h3>
          <canvas ref="tokenChart"></canvas>
        </div>
        <div class="chart-container">
          <h3>Duration (ms)</h3>
          <canvas ref="durationChart"></canvas>
        </div>
      </div>

      <div class="results-table">
        <h3>Detailed Results</h3>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Tool</th>
              <th>Duration (ms)</th>
              <th>Tokens</th>
              <th>Cost ($)</th>
              <th>Success</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="result in results" :key="result.task + result.tool">
              <td>{{ result.task }}</td>
              <td>{{ result.tool }}</td>
              <td>{{ result.duration_ms.toLocaleString() }}</td>
              <td>{{ result.tokens_total.toLocaleString() }}</td>
              <td>{{ result.cost_est.toFixed(4) }}</td>
              <td :class="{ success: result.success, failure: !result.success }">
                {{ result.success ? 'Pass' : 'Fail' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
import Chart from 'chart.js/auto';

export default {
  name: 'BenchmarkView',
  data() {
    return {
      results: [],
      timestamp: null,
      loading: true,
      error: null,
      charts: {}
    }
  },
  async mounted() {
    try {
      const response = await fetch('/benchmarks.json');
      if (!response.ok) throw new Error('Failed to fetch benchmark data');
      const data = await response.json();
      this.results = data.results;
      this.timestamp = data.timestamp;
      this.loading = false;
      this.$nextTick(() => {
        this.renderCharts();
      });
    } catch (e) {
      this.error = e.message;
      this.loading = false;
    }
  },
  methods: {
    renderCharts() {
      // Group by Task
      const tasks = [...new Set(this.results.map(r => r.task))];
      const tools = [...new Set(this.results.map(r => r.tool))];

      const colors = ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff'];

      // Token Chart
      const tokenCtx = this.$refs.tokenChart.getContext('2d');
      const tokenDatasets = tools.map((tool, i) => ({
        label: tool,
        data: tasks.map(task => {
          const r = this.results.find(res => res.task === task && res.tool === tool);
          return r ? r.tokens_total : 0;
        }),
        backgroundColor: colors[i % colors.length]
      }));

      this.charts.tokenChart = new Chart(tokenCtx, {
        type: 'bar',
        data: {
          labels: tasks,
          datasets: tokenDatasets
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Total Tokens per Task'
            }
          }
        }
      });

      // Duration Chart
      const durationCtx = this.$refs.durationChart.getContext('2d');
      const durationDatasets = tools.map((tool, i) => ({
        label: tool,
        data: tasks.map(task => {
          const r = this.results.find(res => res.task === task && res.tool === tool);
          return r ? r.duration_ms : 0;
        }),
        backgroundColor: colors[i % colors.length]
      }));

      this.charts.durationChart = new Chart(durationCtx, {
        type: 'bar',
        data: {
          labels: tasks,
          datasets: durationDatasets
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Duration (ms) per Task'
            }
          }
        }
      });
    }
  },
  beforeUnmount() {
    if (this.charts.tokenChart) this.charts.tokenChart.destroy();
    if (this.charts.durationChart) this.charts.durationChart.destroy();
  }
}
</script>

<style scoped>
.benchmark-view {
  padding: 20px;
}
.charts {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 30px;
}
.chart-container {
  flex: 1;
  min-width: 400px;
  background: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}
th {
  background-color: #f8f9fa;
}
.success {
  color: green;
  font-weight: bold;
}
.failure {
  color: red;
  font-weight: bold;
}
</style>
