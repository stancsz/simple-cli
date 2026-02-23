<template>
  <div style="height: 300px;">
      <Scatter :data="chartData" :options="chartOptions" />
  </div>
</template>

<script>
import { Scatter } from 'vue-chartjs'

export default {
    components: { Scatter },
    props: {
        anomalies: { type: Array, required: true }
    },
    computed: {
        chartData() {
            // Group by metric
            const datasets = [];
            const metrics = [...new Set(this.anomalies.map(a => a.metric))];

            const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];

            metrics.forEach((m, idx) => {
                const data = this.anomalies.filter(a => a.metric === m).map(a => ({
                    x: new Date(a.timestamp).getTime(),
                    y: a.z_score
                }));

                datasets.push({
                    label: m,
                    data: data,
                    backgroundColor: colors[idx % colors.length]
                });
            });

            return { datasets };
        },
        chartOptions() {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'hour' },
                        title: { display: true, text: 'Time' }
                    },
                    y: {
                        title: { display: true, text: 'Z-Score' }
                    }
                }
            }
        }
    }
}
</script>
