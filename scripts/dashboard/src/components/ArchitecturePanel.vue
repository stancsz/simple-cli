<template>
  <div class="panel">
    <h3>Architectural Health Monitor</h3>

    <div v-if="loading" class="loading">Loading architectural metrics...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="architectureData">
      <div class="architecture-summary">
        <div class="status-item">
            <span class="label">Total Files:</span>
            <span class="value">{{ architectureData.totalFiles }}</span>
        </div>
        <div class="status-item">
            <span class="label">Total LOC:</span>
            <span class="value">{{ architectureData.totalLinesOfCode }}</span>
        </div>
        <div class="status-item">
             <span class="label">Avg Complexity:</span>
             <span class="value">{{ architectureData.averageComplexity ? architectureData.averageComplexity.toFixed(2) : '0.00' }}</span>
        </div>
      </div>

      <div v-if="architectureData.topRefactoringCandidates && architectureData.topRefactoringCandidates.length > 0">
        <h4>Top Refactoring Candidates</h4>
        <table class="candidates-table">
            <thead>
                <tr>
                    <th>File Path</th>
                    <th>Complexity</th>
                    <th>LOC</th>
                    <th>Dependencies</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="file in architectureData.topRefactoringCandidates" :key="file.filePath">
                    <td>{{ file.filePath }}</td>
                    <td :class="{'high-complexity': file.cyclomaticComplexity > 15}">{{ file.cyclomaticComplexity }}</td>
                    <td>{{ file.linesOfCode }}</td>
                    <td>{{ file.dependencyCount }}</td>
                </tr>
            </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      architectureData: null,
      loading: true,
      error: null
    }
  },
  async mounted() {
    await this.fetchArchitectureData();
  },
  methods: {
    async fetchArchitectureData() {
        this.loading = true;
        this.error = null;
        try {
            const res = await fetch('/api/dashboard/architecture');
            if (!res.ok) {
                throw new Error('Failed to fetch architecture data');
            }
            this.architectureData = await res.json();
        } catch (e) {
            this.error = "Error loading architectural data: " + e.message;
        } finally {
            this.loading = false;
        }
    }
  }
}
</script>

<style scoped>
.architecture-summary {
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

.candidates-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 0.9em;
}

.candidates-table th, .candidates-table td {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid #ddd;
}

.candidates-table th {
    background-color: #f8f9fa;
    color: #333;
}

.high-complexity {
    color: #d9534f;
    font-weight: bold;
}
</style>
