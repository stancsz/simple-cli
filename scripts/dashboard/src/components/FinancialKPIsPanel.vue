<template>
  <div class="panel">
    <h3>Financial KPIs</h3>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Revenue (Last 30d)</div>
        <div class="kpi-value">${{ formatMoney(financialData.revenue_last_30d) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Outstanding Invoices</div>
        <div class="kpi-value">${{ formatMoney(financialData.outstanding_amount) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Overdue Invoices</div>
        <div class="kpi-value alert">${{ formatMoney(financialData.overdue_amount) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active Clients</div>
        <div class="kpi-value">{{ financialData.active_clients_billing || 0 }}</div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    financialData: {
      type: Object,
      default: () => ({})
    }
  },
  methods: {
    formatMoney(val) {
        return (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
}
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}
.kpi-card {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #e9ecef;
}
.kpi-label {
  font-size: 0.9em;
  color: #6c757d;
  margin-bottom: 5px;
}
.kpi-value {
  font-size: 1.5em;
  font-weight: bold;
  color: #343a40;
}
.kpi-value.alert {
    color: #dc3545;
}
</style>
