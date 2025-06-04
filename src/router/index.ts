import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import LoginView from '../views/LoginView.vue'

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
router.beforeEach((to, from, next) => {
  // 检查路由是否需要认证
  if (to.matched.some(record => record.meta.requiresAuth)) {
    // 检查是否有认证 cookie
    const hasAuthCookie = document.cookie.split(';').some(cookie => {
      const [name] = cookie.trim().split('=');
      return name === 'cloud_access' || name === 'cloud_refresh';
    });

    if (!hasAuthCookie) {
      // 没有认证信息，重定向到登录页
      next({ name: 'login' });
    } else {
      // 有认证信息，允许访问
      next();
    }
  } else {
    // 不需要认证的路由直接放行
    next();
  }
});

export default router
