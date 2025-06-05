// 认证服务
import config from '@/config'

export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = 'cloud_access_token'
  
  /**
   * 存储访问令牌
   */
  static setAccessToken(token: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token)
  }
  
  /**
   * 获取访问令牌
   */
  static getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY)
  }
  
  /**
   * 清除访问令牌
   */
  static clearAccessToken(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY)
  }
  
  /**
   * 处理登录响应，提取并保存访问令牌
   */
  static handleLoginResponse(response: Response): void {
    const accessToken = response.headers.get('x-access-token')
    if (accessToken) {
      this.setAccessToken(accessToken)
    }
  }
  
  /**
   * 处理响应，检查是否有新的访问令牌（刷新后）
   */
  static handleResponse(response: Response): void {
    const newAccessToken = response.headers.get('x-access-token')
    if (newAccessToken) {
      this.setAccessToken(newAccessToken)
    }
  }
  
  /**
   * 检查是否有访问令牌（快速检查，不发送网络请求）
   */
  static isLoggedIn(): boolean {
    return !!this.getAccessToken()
  }
  
  /**
   * 创建带有认证信息的请求头
   */
  static createAuthHeaders(): HeadersInit {
    const token = this.getAccessToken()
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    return headers
  }
  
  /**
   * 创建带有认证信息的 fetch 选项
   */
  static createAuthFetchOptions(options: RequestInit = {}): RequestInit {
    const token = this.getAccessToken()
    
    return {
      ...options,
      credentials: 'include', // 包含cookie（刷新令牌）
      headers: {
        ...this.createAuthHeaders(),
        ...options.headers
      }
    }
  }
  
  /**
   * 退出登录
   */
  static logout(): void {
    this.clearAccessToken()
  }
  
  /**
   * 检查响应是否为认证错误
   */
  static isAuthError(response: Response): boolean {
    return response.status === 401 || response.status === 403
  }
  
  /**
   * 处理认证错误
   */
  static handleAuthError(): void {
    this.clearAccessToken()
    // 可以在这里添加重定向到登录页的逻辑
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }
}

export default AuthService
