<template>
  <div class="panel">
    <h3>System Health</h3>
    <div class="health-summary">
        <div class="status-item">
            <span class="label">Uptime:</span>
            <span class="value">{{ formatUptime(healthData.uptime) }}</span>
        </div>
        <div class="status-item">
            <span class="label">Active Alerts:</span>
            <span class="value" :class="{ alert: healthData.alerts > 0 }">{{ healthData.alerts || 0 }}</span>
        </div>
        <div class="status-item">
             <span class="label">Last Showcase:</span>
             <span class="value" :class="{ success: healthData.last_showcase_success, failure: healthData.last_showcase_success === false }">
                 {{ healthData.last_showcase_success === undefined ? 'N/A' : (healthData.last_showcase_success ? 'PASS' : 'FAIL') }}
             </span>
        </div>
    </div>

    <div v-if="healthData.active_alerts && healthData.active_alerts.length > 0" class="alerts-list">
        <h4>Active Alerts</h4>
        <ul>
            <li v-for="(alert, idx) in healthData.active_alerts" :key="idx" class="alert-item">
                {{ alert.message }} <small>{{ new Date(alert.timestamp).toLocaleTimeString() }}</small>
            </li>
        </ul>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    healthData: {
      type: Object,
      default: () => ({})
    }
  },
  methods: {
    formatUptime(seconds) {
        if (!seconds) return '0s';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    }
  }
}
</script>

<style scoped>
.health-summary {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
}
.status-item {
    display: flex;
    flex-direction: column;
}
.status-item .label {
    font-size: 0.8em;
    color: #666;
}
.status-item .value {
    font-weight: bold;
    font-size: 1.1em;
}
.status-item .value.alert { color: red; }
.status-item .value.success { color: green; }
.status-item .value.failure { color: red; }

.alerts-list {
    margin-top: 10px;
    background: #fff3cd;
    padding: 10px;
    border-radius: 4px;
}
.alert-item {
    font-size: 0.9em;
    color: #856404;
    border-bottom: 1px solid #ffeeba;
    padding: 4px 0;
}
</style>
