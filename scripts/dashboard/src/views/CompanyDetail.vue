<template>
  <div class="company-detail" v-if="companyData">
    <div class="header">
      <router-link to="/">&larr; Back to Dashboard</router-link>
      <h1>{{ companyId }}</h1>
    </div>

    <div class="overview-stats">
        <div class="stat-card">
            <div class="label">Total Tasks</div>
            <div class="value">{{ companyData.task_count }}</div>
        </div>
        <div class="stat-card">
            <div class="label">Success Rate</div>
            <div class="value">{{ companyData.success_rate }}%</div>
        </div>
        <div class="stat-card">
            <div class="label">Avg Duration</div>
            <div class="value">{{ companyData.avg_duration_ms }}ms</div>
        </div>
        <div class="stat-card">
            <div class="label">Est. Cost</div>
            <div class="value">${{ companyData.estimated_cost_usd }}</div>
        </div>
    </div>

    <PillarMetrics :pillars="companyData.pillars" />

  </div>
  <div v-else class="loading">
    Loading...
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { fetchMetrics, type CompanyMetrics } from '../api/metrics';
import PillarMetrics from '../components/PillarMetrics.vue';

const route = useRoute();
const companyId = computed(() => route.params.id as string);
const companyData = ref<CompanyMetrics | null>(null);

onMounted(async () => {
  try {
    const allMetrics = await fetchMetrics();
    if (allMetrics[companyId.value]) {
        companyData.value = allMetrics[companyId.value];
    }
  } catch (e) {
    console.error(e);
  }
});
</script>

<style scoped>
.header {
    margin-bottom: 2rem;
}
.header a {
    color: #666;
    text-decoration: none;
    margin-bottom: 0.5rem;
    display: inline-block;
}

.overview-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
}

.stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.stat-card .value {
    font-size: 1.5rem;
    font-weight: bold;
    color: #2c3e50;
}

.stat-card .label {
    font-size: 0.85rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
</style>
