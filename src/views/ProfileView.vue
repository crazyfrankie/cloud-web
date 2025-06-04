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
              <span class="info-text">{{ formatDate(userInfo.createTime) }}</span>
            </div>

            <div class="form-group">
              <label>上次修改:</label>
              <span class="info-text">{{ formatDate(userInfo.updateTime) }}</span>
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

const router = useRouter()
const store = useStore()
const avatarInput = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)

const userInfo = reactive({
  id: '',
  nickname: '',
  avatar: '',
  birthday: '',
  createTime: 0,
  updateTime: 0
})

onMounted(async () => {
  await loadUserInfo()
})

const loadUserInfo = async () => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/user`, {
      method: 'GET',
      credentials: 'include'
    })

    const result = await response.json()
    
    if (result.code === 20000 && result.data) {
      const data = result.data
      userInfo.id = data.id
      userInfo.nickname = data.nickname
      userInfo.avatar = data.avatar
      userInfo.birthday = data.birthday ? data.birthday.substr(0, 10) : ''
      userInfo.createTime = data.ctime
      userInfo.updateTime = data.utime
    } else {
      alert('获取用户信息失败')
      router.push('/')
    }
  } catch (error) {
    console.error('Get user info error:', error)
    alert('获取用户信息失败，请检查网络连接')
    router.push('/')
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
      credentials: 'include',
      body: formData
    })
    
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
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        nickname: userInfo.nickname,
        birthday: userInfo.birthday
      })
    })
    
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

const formatDate = (time: number | bigint) => {
  if (!time) return '未知';
  
  // 转换为毫秒（JavaScript Date 使用毫秒）
  const milliseconds = typeof time === 'bigint' 
    ? Number(time) * 1000 
    : time * 1000;
  
  const date = new Date(milliseconds);
  
  // 获取年月日
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 月份从 0 开始，所以要 +1
  const day = date.getDate();
  
  // 获取时分秒
  const hours = date.getHours().toString().padStart(2, '0'); // 补零
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  // 返回格式：2025/5/24 14:30:45
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

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
