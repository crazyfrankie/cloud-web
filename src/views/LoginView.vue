<template>
  <div class="auth-container">
    <div class="auth-box">
      <h2>登录 Cloud Storage</h2>
      
      <form @submit.prevent="handleSubmit" class="auth-form">
        <div class="form-group">
          <label for="nickname">昵称:</label>
          <input 
            type="text" 
            id="nickname" 
            v-model="form.nickname" 
            required
          >
        </div>
        
        <div class="form-group">
          <label for="password">密码:</label>
          <input 
            type="password" 
            id="password" 
            v-model="form.password" 
            required
          >
        </div>
        
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>
      </form>
      
      <p class="login-tip">
        如果账号不存在，系统将自动为您创建新账号
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import config from '@/config'
import AuthService from '@/services/AuthService'

const router = useRouter()
const store = useStore()

const isLoading = ref(false)

const form = reactive({
  nickname: '',
  password: ''
})

const handleSubmit = async () => {
  if (isLoading.value) return
  
  isLoading.value = true
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        nickname: form.nickname,
        password: form.password
      })
    })

    const result = await response.json()
    
    if (result.code === 20000) {
      // 处理登录响应，提取并保存访问令牌
      AuthService.handleLoginResponse(response)
      
      // 登录成功，直接跳转到 dashboard
      // 用户信息会在 dashboard 组件中获取
      router.push('/dashboard')
    } else {
      alert(result.msg || '登录失败')
    }
  } catch (error) {
    console.error('Auth error:', error)
    alert('操作失败，请检查网络连接')
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.auth-box {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

.auth-box h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #555;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
}

button {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

button:hover:not(:disabled) {
  transform: translateY(-2px);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.login-tip {
  text-align: center;
  margin-top: 20px;
  color: #666;
  font-size: 14px;
}
</style>
