import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CompanyDetail from '../views/CompanyDetail.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/company/:id',
      name: 'company',
      component: CompanyDetail
    }
  ]
})

export default router
