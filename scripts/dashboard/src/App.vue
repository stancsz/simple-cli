<template>
  <div class="container">
    <header>
      <h1>Jules Operational Dashboard</h1>
      <div class="nav-controls">
          <button @click="currentView = 'dashboard'" :class="{ active: currentView === 'dashboard' }">Dashboard</button>
          <button @click="currentView = 'intelligence'" :class="{ active: currentView === 'intelligence' }">Intelligence</button>
          <a href="/ecosystem" class="nav-link-btn">Ecosystem Observability</a>
      </div>
      <div id="status-indicator">● Connected</div>
    </header>

    <component :is="currentViewComponent" />
  </div>
</template>

<script>
import DashboardView from './views/DashboardView.vue'
import IntelligenceView from './views/IntelligenceView.vue'

export default {
  components: { DashboardView, IntelligenceView },
  data() {
    return {
      currentView: 'dashboard'
    }
  },
  computed: {
    currentViewComponent() {
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
.nav-link-btn {
    margin-right: 10px;
    padding: 8px 16px;
    border: none;
    background: #e0e0e0;
    cursor: pointer;
    border-radius: 4px;
    text-decoration: none;
    color: #333;
    font-size: 13.3333px; /* Match default button font size */
    font-family: Arial, sans-serif;
    display: inline-block;
}
.nav-link-btn:hover {
    background: #d0d0d0;
}
</style>
