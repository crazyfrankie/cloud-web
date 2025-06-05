import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AuthService from '@/services/AuthService'
import config from '@/config'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'login',
    component: LoginView
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import(/* webpackChunkName: "dashboard" */ '../views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import(/* webpackChunkName: "profile" */ '../views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/text-preview/:fileId',
    name: 'textPreview',
    component: () => import(/* webpackChunkName: "textPreview" */ '../views/TextPreviewView.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  // 如果用户访问根路径，且有访问令牌，重定向到dashboard
  if (to.path === '/' && AuthService.isLoggedIn()) {
    next({ name: 'dashboard' });
    return;
  }
  
  // 检查路由是否需要认证
  if (to.matched.some(record => record.meta.requiresAuth)) {
    // 对于需要认证的路由，直接放行，让组件内部去处理认证
    // 如果认证失败，组件会自动跳转到登录页
    next();
  } else {
    // 不需要认证的路由直接放行
    next();
  }
});

export default router
