<template>
  <div class="container">
    <header>
      <h1>Jules Operational Dashboard</h1>
      <div class="nav-controls">
          <button @click="currentView = 'dashboard'" :class="{ active: currentView === 'dashboard' }">Dashboard</button>
          <button @click="currentView = 'intelligence'" :class="{ active: currentView === 'intelligence' }">Intelligence</button>
          <button @click="currentView = 'benchmark'" :class="{ active: currentView === 'benchmark' }">Benchmark</button>
      </div>
      <div id="status-indicator">● Connected</div>
    </header>

    <component :is="currentViewComponent" />
  </div>
</template>

<script>
import DashboardView from './views/DashboardView.vue'
import IntelligenceView from './views/IntelligenceView.vue'
import BenchmarkView from './views/BenchmarkView.vue'

export default {
  components: { DashboardView, IntelligenceView, BenchmarkView },
  data() {
    return {
      currentView: 'dashboard'
    }
  },
  computed: {
    currentViewComponent() {
      if (this.currentView === 'benchmark') return 'BenchmarkView';
      return this.currentView === 'dashboard' ? 'DashboardView' : 'IntelligenceView'
    }
  }
}
</script>

<style>
.nav-controls button {
    margin-right: 10px;
    padding: 8px 16px;
    border: none;
    background: #e0e0e0;
    cursor: pointer;
    border-radius: 4px;
}
.nav-controls button.active {
    background: #007bff;
    color: white;
}
</style>
