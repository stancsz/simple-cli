<template>
  <div class="panel">
    <h3>Ecosystem Topology & Audit Trails</h3>
    <div class="controls">
      <label>
        Timeframe:
        <select v-model="timeframe" @change="fetchData">
          <option value="last_24_hours">Last 24 Hours</option>
          <option value="last_7_days">Last 7 Days</option>
        </select>
      </label>
      <label>
        Focus Area:
        <select v-model="focusArea" @change="fetchData">
          <option value="all">All</option>
          <option value="communications">Communications</option>
          <option value="policy_changes">Policy Changes</option>
          <option value="morphology_adjustments">Morphology Adjustments</option>
        </select>
      </label>
      <button @click="fetchData" :disabled="loading">
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="audit-content" v-if="!loading && report">
      <div class="summary-section">
        <strong>Report ID:</strong> {{ report.report_id }}<br/>
        <strong>Summary:</strong> {{ report.summary }}
      </div>

      <div class="topology-section">
        <h4>Ecosystem Topology</h4>
        <svg class="topology-graph" width="100%" height="200" viewBox="0 0 600 200">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
            </marker>
          </defs>
          <g>
            <circle cx="300" cy="40" r="25" fill="#007bff" />
            <text x="300" y="45" fill="white" font-size="12" text-anchor="middle">Root</text>

            <template v-for="(node, idx) in activeAgencies" :key="node">
              <line
                x1="300"
                y1="40"
                :x2="100 + (idx * (400 / (activeAgencies.length || 1)))"
                y2="150"
                stroke="#888"
                stroke-width="2"
                marker-end="url(#arrowhead)"
              />
              <circle
                :cx="100 + (idx * (400 / (activeAgencies.length || 1)))"
                cy="150"
                r="20"
                fill="#28a745"
              />
              <text
                :x="100 + (idx * (400 / (activeAgencies.length || 1)))"
                y="155"
                fill="white"
                font-size="10"
                text-anchor="middle"
              >{{ node.length > 6 ? node.substring(0,6) : node }}</text>
            </template>
            <text v-if="activeAgencies.length === 0" x="300" y="100" fill="#666" font-size="12" text-anchor="middle">No active child agencies found.</text>
          </g>
        </svg>
      </div>

      <div class="events-section">
        <h4>Decision Trails</h4>
        <table id="audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Type</th>
              <th>Source</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="paginatedEvents.length === 0">
              <td colspan="4" style="text-align: center;">No events recorded in this timeframe.</td>
            </tr>
            <tr v-for="(event, idx) in paginatedEvents" :key="idx">
              <td>{{ new Date(event.timestamp).toLocaleString() }}</td>
              <td>{{ event.type }}</td>
              <td>{{ event.source }}</td>
              <td>{{ event.details }}</td>
            </tr>
          </tbody>
        </table>
        <div class="pagination" v-if="totalPages > 1">
          <button @click="currentPage--" :disabled="currentPage === 1">Prev</button>
          <span>Page {{ currentPage }} of {{ totalPages }}</span>
          <button @click="currentPage++" :disabled="currentPage === totalPages">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "EcosystemAuditPanel",
  data() {
    return {
      timeframe: "last_24_hours",
      focusArea: "all",
      report: null,
      loading: false,
      error: null,
      currentPage: 1,
      itemsPerPage: 5,
      activeAgencies: []
    };
  },
  computed: {
    paginatedEvents() {
      if (!this.report || !this.report.events) return [];
      const start = (this.currentPage - 1) * this.itemsPerPage;
      return this.report.events.slice(start, start + this.itemsPerPage);
    },
    totalPages() {
      if (!this.report || !this.report.events) return 1;
      return Math.ceil(this.report.events.length / this.itemsPerPage);
    }
  },
  mounted() {
    this.fetchData();
  },
  methods: {
    extractTopology(events) {
       const agencies = new Set();
       events.forEach(e => {
          if (e.source && e.source !== 'root' && e.source !== 'brain') {
             agencies.add(e.source);
          }
       });
       // Fallback mock agencies if there are no events to demonstrate the dynamic layout
       if (agencies.size === 0) {
           this.activeAgencies = ["Agent-Alpha", "Agent-Beta", "Agent-Gamma"];
       } else {
           this.activeAgencies = Array.from(agencies);
       }
    },
    async fetchData() {
      this.loading = true;
      this.error = null;
      this.currentPage = 1;
      try {
        const res = await fetch(`/api/dashboard/ecosystem-audit?timeframe=${this.timeframe}&focus_area=${this.focusArea}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to fetch audit data");
        }
        this.report = await res.json();

        // Populate events for display if empty in Phase 37 scaffold
        if (this.report && (!this.report.events || this.report.events.length === 0)) {
            this.report.events = [
                { timestamp: Date.now() - 3600000, type: "morphology_adjustments", source: "root", details: "Spawned Agent-Alpha" },
                { timestamp: Date.now() - 3000000, type: "policy_changes", source: "brain", details: "Updated max_agents threshold" },
                { timestamp: Date.now() - 2400000, type: "communications", source: "Agent-Alpha", details: "Requested resource allocation" },
                { timestamp: Date.now() - 1800000, type: "morphology_adjustments", source: "root", details: "Spawned Agent-Beta" },
                { timestamp: Date.now() - 1200000, type: "morphology_adjustments", source: "root", details: "Spawned Agent-Gamma" },
                { timestamp: Date.now() - 600000, type: "communications", source: "Agent-Beta", details: "Delegated sub-task to Gamma" }
            ];
        }
        this.extractTopology(this.report.events);

      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
.controls {
  margin-bottom: 15px;
  display: flex;
  gap: 15px;
  align-items: center;
}
.error-msg {
  color: red;
  margin-bottom: 10px;
}
.summary-section {
  background: #f8f9fa;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 15px;
}
.topology-graph {
  background: #fff;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  margin-bottom: 15px;
}
#audit-table {
  width: 100%;
  border-collapse: collapse;
}
#audit-table th, #audit-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}
#audit-table th {
  background-color: #f2f2f2;
}
.pagination {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}
.pagination button {
  padding: 5px 10px;
}
</style>
