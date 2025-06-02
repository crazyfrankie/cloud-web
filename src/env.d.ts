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
