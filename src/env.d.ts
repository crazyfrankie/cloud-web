/// <reference types="vite/client" />

// Vue 3 类型声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// 全局环境变量声明
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    BASE_URL: string;
    VUE_APP_API_URL: string;
    VUE_APP_RESOURCE_URL?: string;
    VUE_APP_DEFAULT_AVATAR?: string;
  }
}
