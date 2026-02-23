import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, TimeScale } from 'chart.js'
import 'chartjs-adapter-date-fns';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, TimeScale)

createApp(App).mount('#app')
