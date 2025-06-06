<template>
  <div class="dashboard">
    <header class="header">
      <h1>Cloud Storage</h1>
      <div class="user-info">
        <div class="user-dropdown">
          <img :src="userAvatar" alt="用户头像" class="user-avatar" @click="toggleUserDropdown">
          <div :class="['dropdown-menu', { 'show': dropdownVisible }]">
            <div class="dropdown-item" @click="navigateToProfile">
              <span>个人信息</span>
            </div>
            <div class="dropdown-item" @click="logout">
              <span>退出</span>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="main-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <button class="btn-primary" @click="showUploadModal">上传文件</button>
        <button class="btn-secondary" @click="showFolderModal">新建文件夹</button>
        <button 
          class="btn-back" 
          @click="navigateToParent" 
          :disabled="store.state.currentPath === '/'"
        >
          返回上级
        </button>
        <div class="breadcrumb">
          <span>{{ currentPath }}</span>
        </div>
      </div>

      <!-- 文件列表 -->
      <file-list 
        :files="files" 
        :loading="loading"
        @navigate="navigateToFolder"
        @delete="deleteFile"
        @rename="showRenameModal"
      />
    </div>

    <!-- 上传文件模态框 -->
    <upload-modal 
      :visible="uploadModalVisible" 
      @close="uploadModalVisible = false"
      @upload-complete="refreshFiles"
    />

    <!-- 创建文件夹模态框 -->
    <folder-modal 
      :visible="folderModalVisible" 
      @close="folderModalVisible = false"
      @create="handleCreateFolder"
    />

    <!-- 重命名模态框 -->
    <rename-modal
      v-if="renameModalVisible"
      :file="fileToRename"
      @close="renameModalVisible = false"
      @rename="handleRenameFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import FileList from '@/components/FileList.vue'
import UploadModal from '@/components/UploadModal.vue'
import FolderModal from '@/components/FolderModal.vue'
import RenameModal from '@/components/RenameModal.vue'
import config from '@/config'
import AuthService from '@/services/AuthService'

const router = useRouter()
const store = useStore()

const files = ref<Array<any>>([])
const loading = ref(false)
const dropdownVisible = ref(false)
const uploadModalVisible = ref(false)
const folderModalVisible = ref(false)
const renameModalVisible = ref(false)
const fileToRename = ref<any>(null)

const userAvatar = computed(() => store.getters.userAvatar)
const currentPath = computed(() => store.state.currentPath)

onMounted(async () => {
  // 先尝试获取用户信息来验证登录状态
  const userInfoLoaded = await loadUserInfo()
  
  if (!userInfoLoaded) {
    // 如果获取用户信息失败，跳转到登录页
    router.push('/')
    return
  }
  
  // 用户信息获取成功，继续加载文件夹内容
  loadFolderContents(store.state.currentPath)
})

// 切换用户下拉菜单
const toggleUserDropdown = () => {
  dropdownVisible.value = !dropdownVisible.value
  
  // 点击其他地方关闭下拉菜单
  if (dropdownVisible.value) {
    const closeDropdown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.user-dropdown')) {
        dropdownVisible.value = false
        document.removeEventListener('click', closeDropdown)
      }
    }
    
    // 延迟添加事件监听，避免当前点击立即关闭
    setTimeout(() => {
      document.addEventListener('click', closeDropdown)
    }, 0)
  }
}

// 导航到个人信息页面
const navigateToProfile = () => {
  router.push('/profile')
}

// 刷新文件列表（上传完成后调用）
const refreshFiles = () => {
  loadFolderContents(store.state.currentPath)
}

// 加载用户信息
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
        store.commit('setUser', result.data)
        return true
      }
    }
    
    // 如果响应不成功或数据格式不正确，清除本地token
    AuthService.clearAccessToken()
    return false
  } catch (error) {
    console.error('Load user info error:', error)
    // 网络错误，清除本地token
    AuthService.clearAccessToken()
    return false
  }
}

// 退出登录
const logout = async () => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/auth/logout`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })
    
    // 清除访问令牌
    AuthService.clearAccessToken()
    
    store.dispatch('logout')
    router.push('/')
  } catch (error) {
    console.error('Logout error:', error)
    // 即使请求失败，也清除本地令牌
    AuthService.clearAccessToken()
    store.dispatch('logout')
    router.push('/')
  }
}

// 加载文件夹内容
const loadFolderContents = async (path: string) => {
  loading.value = true
  files.value = [] // 重置文件列表，避免显示旧数据
  
  try {
    console.log(`Loading folder contents for path: ${path}`);
    const response = await fetch(`${config.apiBaseUrl}/files?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    console.log('API response:', result);
    
    if (result.code === 20000) {
      try {
        // 检查数据是否存在
        if (!result.data || !result.data.contents) {
          console.warn('API response missing contents field');
          files.value = [];
          return;
        }
        
        const contents = result.data.contents || [];
        
        // 处理文件和文件夹列表
        const processedData = contents.map((item: any) => ({
          ...item,
          id: item.id || 0,
          name: item.name || 'Unknown',
          type: item.isDir ? 'folder' : 'file',
          updateTime: item.utime ? new Date(item.utime * 1000).toISOString() : new Date().toISOString(),
          size: item.size || 0,
          url: item.url || '' // 映射URL字段用于文件预览
        }));
        
        console.log('Processed data:', processedData);
        files.value = processedData;
      } catch (err) {
        console.error('Error processing API response:', err);
        alert('处理文件列表数据时出错');
        files.value = [];
      }
    } else {
      console.error('API returned error code:', result.code, result.msg);
      alert('获取文件列表失败：' + result.msg)
    }
  } catch (error) {
    console.error('Load folder contents error:', error)
    alert('获取文件列表失败，请检查网络连接')
  } finally {
    loading.value = false
  }
}

// 导航到文件夹
const navigateToFolder = (folder: any) => {
  const newPath = folder.path || (store.state.currentPath === '/' ? 
    '/' + folder.name : 
    store.state.currentPath + '/' + folder.name)
  
  store.dispatch('navigateToFolder', {
    id: folder.id,
    name: folder.name,
    path: newPath
  })
  
  loadFolderContents(newPath)
}

// 导航到上一级文件夹
const navigateToParent = () => {
  if (store.state.currentPath !== '/') {
    store.dispatch('navigateBack')
    loadFolderContents(store.state.currentPath)
  }
}



// 删除文件
const deleteFile = async (file: any) => {
  if (!confirm(`确定要删除 ${file.name} 吗？`)) {
    return
  }
  
  try {
    const response = await fetch(`${config.apiBaseUrl}/files?path=${encodeURIComponent(file.path)}`, {
      method: 'DELETE',
      ...AuthService.createAuthFetchOptions()
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    
    if (result.code === 20000) {
      alert('删除成功')
      loadFolderContents(store.state.currentPath)
    } else {
      alert('删除失败：' + result.msg)
    }
  } catch (error) {
    console.error('Delete error:', error)
    alert('删除失败，请检查网络连接')
  }
}

// 显示重命名模态框
const showRenameModal = (file: any) => {
  fileToRename.value = file
  renameModalVisible.value = true
}

// 处理重命名文件/文件夹
const handleRenameFile = async (newName: string) => {
  if (!fileToRename.value) return
  
  try {
    // 构建新的路径
    const oldPath = fileToRename.value.path
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const newPath = parentPath === '' ? `/${newName}` : `${parentPath}/${newName}`
    
    // 更新文件信息
    const response = await fetch(`${config.apiBaseUrl}/files/${fileToRename.value.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: newName,
        newPath: newPath
      }),
      ...AuthService.createAuthFetchOptions()
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    
    if (result.code === 20000) {
      alert('重命名成功')
      loadFolderContents(store.state.currentPath)
      renameModalVisible.value = false
    } else {
      alert('重命名失败：' + result.msg)
    }
  } catch (error) {
    console.error('Rename error:', error)
    alert('重命名失败，请检查网络连接')
  }
}

// 显示上传模态框
const showUploadModal = () => {
  uploadModalVisible.value = true
}

// 显示文件夹模态框
const showFolderModal = () => {
  folderModalVisible.value = true
}

// 处理文件上传
const handleUpload = async (files: FileList) => {
  if (files.length === 0) return
  
  try {
    // 循环处理每个文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // 1. 预上传检查
      const checkResponse = await fetch(`${config.apiBaseUrl}/files/precreate`, {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          hash: await calculateFileHash(file),
          parentPath: store.state.currentPath // 添加父目录路径
        }),
        ...AuthService.createAuthFetchOptions()
      })
      
      // 处理可能的令牌刷新
      AuthService.handleResponse(checkResponse)
      
      const checkResult = await checkResponse.json()
      
      if (checkResult.code !== 20000) {
        alert(`文件 ${file.name} 预检查失败: ${checkResult.msg}`)
        continue
      }
      
      // 如果文件已存在，跳过上传
      if (checkResult.data.fileExists) {
        alert(`文件 ${file.name} 已存在，跳过上传`)
        continue
      }
      
      // 2. 上传文件到预签名URL
      const presignedUrl = checkResult.data.presignedUrl
      const objectKey = checkResult.data.objectKey
      
      if (!presignedUrl) {
        alert(`文件 ${file.name} 没有获取到上传URL`)
        continue
      }
      
      // 上传到预签名URL
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',  // 预签名URL通常使用PUT
        body: file
      })
      
      if (!uploadResponse.ok) {
        alert(`文件 ${file.name} 上传失败`)
        continue
      }
      
      // 3. 确认上传完成
      const filePath = store.state.currentPath === '/' ? 
        `/${file.name}` : 
        `${store.state.currentPath}/${file.name}`;
        
      const confirmResponse = await fetch(`${config.apiBaseUrl}/files/create`, {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          path: filePath,
          size: file.size,
          hash: await calculateFileHash(file),
          url: objectKey,  // 使用对象键作为URL
          isDir: false,
          deviceId: 'web-client'
        }),
        ...AuthService.createAuthFetchOptions()
      })
      
      // 处理可能的令牌刷新
      AuthService.handleResponse(confirmResponse)
      
      const confirmResult = await confirmResponse.json()
      
      if (confirmResult.code !== 20000) {
        alert(`文件 ${file.name} 确认上传失败: ${confirmResult.msg}`)
      }
    }
    
    // 所有文件处理完成后，重新加载文件夹内容
    alert('上传处理完成')
    uploadModalVisible.value = false
    loadFolderContents(store.state.currentPath)
  } catch (error) {
    console.error('Upload error:', error)
    alert('上传过程中出错，请检查网络连接')
  }
}

// 计算文件哈希函数（简化版，实际应该使用更可靠的哈希算法）
const calculateFileHash = async (file: File): Promise<string> => {
  // 简单方法：使用文件名、大小和最后修改时间的组合
  return `${file.name}-${file.size}-${file.lastModified}`
  
  // 注意：真实场景应该使用加密API计算真正的哈希值
  // 例如：使用 SubtleCrypto API 计算 SHA-256 哈希
}

// 处理创建文件夹
const handleCreateFolder = async (folderName: string) => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/files`, {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        path: store.state.currentPath === '/' ? 
          `/${folderName}` : 
          `${store.state.currentPath}/${folderName}`,
        isDir: true,
        size: 0
      }),
      ...AuthService.createAuthFetchOptions()
    })
    
    // 处理可能的令牌刷新
    AuthService.handleResponse(response)
    
    const result = await response.json()
    
    if (result.code === 20000) {
      alert('创建成功')
      folderModalVisible.value = false
      loadFolderContents(store.state.currentPath)
    } else {
      alert('创建失败：' + result.msg)
    }
  } catch (error) {
    console.error('Create folder error:', error)
    alert('创建失败，请检查网络连接')
  }
}
</script>

<style scoped>
.dashboard {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background-color: white;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header h1 {
  font-size: 24px;
  color: #667eea;
}

.user-info {
  display: flex;
  align-items: center;
}

.user-dropdown {
  position: relative;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  object-fit: cover;
  border: 2px solid #667eea;
}

.dropdown-menu {
  position: absolute;
  top: 45px;
  right: 0;
  background: white;
  border-radius: 6px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
  width: 150px;
  z-index: 100;
  display: none;
}

.dropdown-menu.show {
  display: block;
}

.dropdown-item {
  padding: 12px 15px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.dropdown-item:hover {
  background-color: #f0f2ff;
}

.main-content {
  flex: 1;
  padding: 20px;
  background-color: white;
  margin: 20px;
  border-radius: 10px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}

.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  gap: 10px;
}

.btn-primary, .btn-secondary, .btn-back {
  padding: 8px 15px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #667eea;
  color: white;
  border: none;
}

.btn-primary:hover {
  background-color: #5a6bd0;
}

.btn-secondary {
  background-color: white;
  color: #667eea;
  border: 1px solid #667eea;
}

.btn-secondary:hover {
  background-color: #f0f2ff;
}

.btn-back {
  background-color: #f1f2f5;
  color: #333;
  border: 1px solid #ddd;
}

.btn-back:hover:not(:disabled) {
  background-color: #e9eaee;
}

.btn-back:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.breadcrumb {
  margin-left: 20px;
  padding: 8px 15px;
  background: #f7f7f9;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
