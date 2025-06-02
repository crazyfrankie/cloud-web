// 应用配置
export default {
  // API 基础路径
  apiBaseUrl: process.env.VUE_APP_API_URL || 'http://localhost:8089',
  
  // 资源基础路径
  resourceBaseUrl: process.env.VUE_APP_RESOURCE_URL || 'http://localhost:9000',
  
  // 默认头像路径
  defaultAvatar: process.env.VUE_APP_DEFAULT_AVATAR || 'http://localhost:9000/cloud-user/default.jpg',
  
  // 版本信息
  version: '1.0.0'
}
