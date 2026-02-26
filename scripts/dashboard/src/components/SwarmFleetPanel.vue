<template>
  <div class="panel">
    <h3>Swarm Fleet Status</h3>
    <table v-if="fleetData && fleetData.length > 0">
      <thead>
        <tr>
          <th>Company/Client</th>
          <th>Status</th>
          <th>Agents</th>
          <th>Pending Issues</th>
          <th>Health</th>
          <th>Last Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="swarm in fleetData" :key="swarm.projectId">
          <td>{{ swarm.company }}</td>
          <td>Active</td> <!-- Assuming active if in list -->
          <td>{{ swarm.active_agents }}</td>
          <td>{{ swarm.pending_issues }}</td>
          <td :class="['health-tag', swarm.health]">{{ swarm.health }}</td>
          <td>{{ new Date(swarm.last_updated).toLocaleString() }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty-state">No active swarms found.</div>
  </div>
</template>

<script>
export default {
  props: {
    fleetData: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}
.health-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}
.health-tag.healthy {
  background-color: #d4edda;
  color: #155724;
}
.health-tag.strained {
  background-color: #fff3cd;
  color: #856404;
}
.empty-state {
    padding: 20px;
    text-align: center;
    color: #666;
}
</style>
