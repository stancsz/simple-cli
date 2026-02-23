import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const app = createApp(App)

app.use(router)

app.mount('#app')
