<template>
  <div class="home">
    <header>
      <h1>Operational Dashboard</h1>
      <div class="summary-box" v-if="summary">
        <strong>Persona Insight:</strong> {{ summary }}
      </div>
      <div class="alerts-box" v-if="alerts.length">
        <h3>Active Alerts</h3>
        <ul>
          <li v-for="alert in alerts" :key="alert">{{ alert }}</li>
        </ul>
      </div>
    </header>

    <div class="metrics-grid">
      <div v-for="(data, company) in metrics" :key="company" class="company-card">
        <h2>{{ company }}</h2>
        <div class="stats">
          <div>Tasks: {{ data.task_count }}</div>
          <div>Success: {{ data.success_rate }}%</div>
          <div>Cost: ${{ data.estimated_cost_usd }}</div>
        </div>
        <div class="actions">
          <router-link :to="{ name: 'company', params: { id: company } }" class="btn">View Details</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fetchMetrics, fetchAlerts, fetchSummary, type CompanyMetrics } from '../api/metrics';

const metrics = ref<Record<string, CompanyMetrics>>({});
const alerts = ref<string[]>([]);
const summary = ref<string>('');

onMounted(async () => {
  try {
    metrics.value = await fetchMetrics();
    alerts.value = await fetchAlerts();
    summary.value = await fetchSummary();
  } catch (e) {
    console.error(e);
  }
});
</script>

<style scoped>
.home {
  padding: 1rem;
}

header {
  margin-bottom: 2rem;
}

.summary-box {
  background: #e3f2fd;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  border-left: 4px solid #2196f3;
}

.alerts-box {
  background: #fff3cd;
  padding: 1rem;
  border-radius: 4px;
  border-left: 4px solid #ffc107;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.company-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.stats {
  display: flex;
  justify-content: space-between;
  margin: 1rem 0;
  font-size: 0.9rem;
  color: #666;
}

.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}
.btn:hover {
  background: #0056b3;
}
</style>
