<template>
  <div class="profile-container">
    <div class="profile-content">
      <h2>个人信息</h2>
      
      <div class="profile-section">
        <div class="profile-avatar-section">
          <img :src="userInfo.avatar || config.defaultAvatar" alt="用户头像" class="profile-avatar">
          <button class="btn-secondary" @click="triggerAvatarUpload">更换头像</button>
          <input 
            type="file" 
            ref="avatarInput" 
            accept="image/*" 
            style="display: none;"
            @change="handleAvatarChange"
          >
        </div>
        
        <div class="profile-info-section">
          <form @submit.prevent="updateProfile">
            <div class="form-group">
              <label for="nickname">昵称:</label>
              <input 
                type="text" 
                id="nickname" 
                v-model="userInfo.nickname" 
                required
              >
            </div>
            
            <div class="form-group">
              <label for="birthday">生日:</label>
              <input 
                type="date" 
                id="birthday" 
                v-model="userInfo.birthday"
              >
            </div>
            
            <div class="form-group">
              <label>注册时间:</label>
              <span class="info-text">{{ formatDate(userInfo.ctime) }}</span>
            </div>

            <div class="form-group">
              <label>上次修改时间:</label>
              <span class="info-text">{{ formatDate(userInfo.utime) }}</span>
            </div>
            
            <div class="profile-actions">
              <button type="submit" class="btn-primary" :disabled="isLoading">
                {{ isLoading ? '保存中...' : '保存修改' }}
              </button>
              <button type="button" class="btn-secondary" @click="goBack">返回</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import config from '@/config'
import AuthService from '@/services/AuthService'

const router = useRouter()
const store = useStore()
const avatarInput = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)

const userInfo = reactive({
  id: '',
  nickname: '',
  avatar: '',
  birthday: '',
  ctime: '',
  utime: ''
})

onMounted(async () => {
  const userInfoLoaded = await loadUserInfo()
  
  if (!userInfoLoaded) {
    // 如果获取用户信息失败，跳转到登录页
    router.push('/')
  }
})

const loadUserInfo = async () => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/user`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })

    // 处理可能的令牌刷新
    AuthService.handleResponse(response)

    if (response.ok) {
      const result = await response.json()
      
      if (result.code === 20000 && result.data) {
        const data = result.data
        userInfo.id = data.id
        userInfo.nickname = data.nickname
        userInfo.avatar = data.avatar
        userInfo.birthday = data.birthday ? data.birthday.substr(0, 10) : ''
        userInfo.ctime = data.ctime
        userInfo.utime = data.utime
        return true
      }
    }
    
    // 如果响应不成功或数据格式不正确，清除本地token
    AuthService.clearAccessToken()
    return false
  } catch (error) {
    console.error('Get user info error:', error)
    // 网络错误，清除本地token
    AuthService.clearAccessToken()
    return false
  }
}

const triggerAvatarUpload = () => {
  if (avatarInput.value) {
    avatarInput.value.click()
  }
}

const handleAvatarChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  
  if (!files || files.length === 0) return
  
  const file = files[0]
  
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }
  
  // 验证文件大小
  if (file.size > 5 * 1024 * 1024) {
    alert('图片大小不能超过5MB')
    return
  }
  
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    
    const response = await fetch(`${config.apiBaseUrl}/user/update/avatar`, {
      method: 'PATCH',
      body: formData,
      // 为FormData请求创建特殊的fetch选项（不设置Content-Type）
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${AuthService.getAccessToken() || ''}`
      }
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    
    if (result.code === 20000 && result.data) {
      userInfo.avatar = result.data
      alert('头像更新成功')
      
      // 更新 store 中的用户信息
      store.commit('setUser', { ...store.state.user, avatar: result.data })
    } else {
      alert('头像上传失败：' + result.msg)
    }
  } catch (error) {
    console.error('Avatar upload error:', error)
    alert('头像上传失败，请检查网络连接')
  }
}

const updateProfile = async () => {
  isLoading.value = true
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/user/update/info`, {
      method: 'PATCH',
      body: JSON.stringify({
        nickname: userInfo.nickname,
        birthday: userInfo.birthday
      }),
      ...AuthService.createAuthFetchOptions()
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    
    if (result.code === 20000) {
      alert('个人信息更新成功')
      
      // 更新 store 中的用户信息
      store.commit('setUser', { 
        ...store.state.user, 
        nickname: userInfo.nickname 
      })
    } else {
      alert('个人信息更新失败：' + result.msg)
    }
  } catch (error) {
    console.error('Update profile error:', error)
    alert('个人信息更新失败，请检查网络连接')
  } finally {
    isLoading.value = false
  }
}

const formatDate = (time: number) => {
  if (!time) return '-'

  const date = new Date(time * 1000) // Convert Unix timestamp to JS Date

  // Extract components
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0') // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0')

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}

const goBack = () => {
  router.push('/dashboard')
}
</script>

<style scoped>
.profile-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-content {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 700px;
}

.profile-content h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
}

.profile-section {
  display: flex;
  gap: 40px;
}

.profile-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.profile-avatar {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #667eea;
}

.profile-info-section {
  flex: 1;
}

.info-text {
  display: inline-block;
  padding: 12px 0;
  color: #555;
}

.profile-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.profile-actions button {
  flex: 1;
}

@media (max-width: 768px) {
  .profile-section {
    flex-direction: column;
  }
  
  .profile-content {
    margin: 20px;
  }
}
</style>
