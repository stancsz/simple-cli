<template>
  <div class="pillar-metrics">
    <h3>4-Pillar Health</h3>
    <div class="pillars-grid">
      <div class="pillar-card" :class="getHealthClass(pillars.sop?.score)">
        <h4>SOP Engine</h4>
        <div class="score">{{ pillars.sop?.score || 'N/A' }}</div>
        <ul>
          <li v-for="(val, key) in pillars.sop?.metrics" :key="key">
            {{ formatKey(key) }}: {{ val }}
          </li>
        </ul>
      </div>
      <div class="pillar-card" :class="getHealthClass(pillars.ghost?.score)">
        <h4>Ghost Mode</h4>
        <div class="score">{{ pillars.ghost?.score || 'N/A' }}</div>
        <ul>
          <li v-for="(val, key) in pillars.ghost?.metrics" :key="key">
            {{ formatKey(key) }}: {{ val }}
          </li>
        </ul>
      </div>
      <div class="pillar-card" :class="getHealthClass(pillars.hr?.score)">
        <h4>HR Loop</h4>
        <div class="score">{{ pillars.hr?.score || 'N/A' }}</div>
        <ul>
          <li v-for="(val, key) in pillars.hr?.metrics" :key="key">
            {{ formatKey(key) }}: {{ val }}
          </li>
        </ul>
      </div>
      <div class="pillar-card" :class="getHealthClass(pillars.context?.score)">
        <h4>Company Context</h4>
        <div class="score">{{ pillars.context?.score || 'N/A' }}</div>
        <ul>
          <li v-for="(val, key) in pillars.context?.metrics" :key="key">
            {{ formatKey(key) }}: {{ val }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';

const props = defineProps<{
  pillars: {
    sop: { score: number, metrics: any },
    ghost: { score: number, metrics: any },
    hr: { score: number, metrics: any },
    context: { score: number, metrics: any }
  }
}>();

function getHealthClass(score: number) {
  if (!score) return 'gray';
  if (score >= 90) return 'green';
  if (score >= 70) return 'yellow';
  return 'red';
}

function formatKey(key: string | number | symbol) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
</script>

<style scoped>
.pillars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.pillar-card {
  padding: 1rem;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-top: 4px solid #ccc;
}

.pillar-card.green { border-top-color: #28a745; }
.pillar-card.yellow { border-top-color: #ffc107; }
.pillar-card.red { border-top-color: #dc3545; }

.score {
  font-size: 2rem;
  font-weight: bold;
  margin: 0.5rem 0;
}

ul {
  list-style: none;
  padding: 0;
  font-size: 0.9rem;
}

li {
  margin-bottom: 0.25rem;
}
</style>
