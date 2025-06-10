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
        @batch-download="handleBatchDownload"
        @batch-delete="handleBatchDelete"
        @start-monitored-download="handleStartMonitoredDownload"
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

    <!-- 下载确认模态框 -->
    <download-modal
      :visible="downloadModalVisible"
      :type="downloadModalType"
      :title="downloadModalTitle"
      :total-size="downloadTotalSize"
      :file-count="downloadFileCount"
      :zip-name="downloadZipName"
      :processing-message="downloadProcessingMessage"
      :loading="downloadLoading"
      :queue-info="currentQueueInfo"
      @close="closeDownloadModal"
      @confirm="handleDownloadConfirm"
      @cancel-queue="handleCancelQueue"
    />

    <!-- 下载进度监控 -->
    <download-progress-monitor 
      ref="downloadMonitor"
      @download-complete="handleDownloadComplete"
      @download-error="handleDownloadError"
    />

    <!-- 前端下载队列管理器 -->
    <download-queue-manager />

    <!-- 通知组件 -->
    <notification-toast ref="notificationToast" />

    <!-- 确认对话框组件 -->
    <confirm-modal 
      :visible="confirmModalVisible"
      :title="confirmModalTitle" 
      :message="confirmModalMessage" 
      @close="confirmModalVisible = false"
      @confirm="handleConfirmAction"
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
import DownloadModal from '@/components/DownloadModal.vue'
import DownloadProgressMonitor from '@/components/DownloadProgressMonitor.vue'
import DownloadQueueManager from '@/components/DownloadQueueManager.vue'
import NotificationToast from '@/components/NotificationToast.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import config from '@/config'
import AuthService from '@/services/AuthService'
import FileDownloadService from '@/services/FileDownloadService'

const router = useRouter()
const store = useStore()

const files = ref<Array<any>>([])
const loading = ref(false)
const dropdownVisible = ref(false)
const uploadModalVisible = ref(false)
const folderModalVisible = ref(false)
const renameModalVisible = ref(false)
const fileToRename = ref<any>(null)

// 下载相关状态
const downloadModalVisible = ref(false)
const downloadModalType = ref<'large-files' | 'confirm' | 'processing' | 'queue'>('confirm')
const downloadModalTitle = ref('下载确认')
const downloadTotalSize = ref(0)
const downloadFileCount = ref(0)
const downloadZipName = ref('')
const downloadProcessingMessage = ref('正在准备文件...')
const downloadLoading = ref(false)
const selectedDownloadItems = ref<Array<any>>([])
const pendingDownloadData = ref<any>(null)

// 队列下载相关状态
const currentQueueInfo = ref<any>(null)
const queueMonitorTimer = ref<number | null>(null)

// 下载进度监控相关状态
const downloadMonitor = ref<InstanceType<typeof DownloadProgressMonitor> | null>(null)

// 通知组件引用
const notificationToast = ref<InstanceType<typeof NotificationToast> | null>(null)

// 确认对话框相关状态
const confirmModalVisible = ref(false)
const confirmModalTitle = ref('确认操作')
const confirmModalMessage = ref('')
const confirmModalCallback = ref<(() => void) | null>(null)

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
        notificationToast.value?.error('处理文件列表数据时出错');
        files.value = [];
      }
    } else {
      console.error('API returned error code:', result.code, result.msg);
      notificationToast.value?.error('获取文件列表失败：' + result.msg);
    }
  } catch (error) {
    console.error('Load folder contents error:', error)
    notificationToast.value?.error('获取文件列表失败，请检查网络连接');
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
  showConfirmDialog(
    '确认删除',
    `确定要删除 ${file.name} 吗？此操作不可恢复。`,
    async () => {
      try {
        const response = await fetch(`${config.apiBaseUrl}/files?path=${encodeURIComponent(file.path)}`, {
          method: 'DELETE',
          ...AuthService.createAuthFetchOptions()
        })
        
        // 处理可能的令牌刷新
        AuthService.handleResponse(response)
        
        const result = await response.json()
        
        if (result.code === 20000) {
          // 删除成功不显示通知，直接刷新列表
          loadFolderContents(store.state.currentPath)
        } else {
          notificationToast.value?.error('删除失败：' + result.msg)
        }
      } catch (error) {
        console.error('Delete error:', error)
        notificationToast.value?.error('删除失败，请检查网络连接')
      }
    }
  )
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
      // 重命名成功不显示通知，直接刷新和关闭模态框
      loadFolderContents(store.state.currentPath)
      renameModalVisible.value = false
    } else {
      notificationToast.value?.error('重命名失败：' + result.msg)
    }
  } catch (error) {
    console.error('Rename error:', error)
    notificationToast.value?.error('重命名失败，请检查网络连接')
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
    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    
    // 循环处理每个文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
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
          notificationToast.value?.error(`文件 ${file.name} 预检查失败: ${checkResult.msg}`)
          errorCount++
          continue
        }
        
        // 如果文件已存在，跳过上传
        if (checkResult.data.fileExists) {
          notificationToast.value?.warning(`文件 ${file.name} 已存在，跳过上传`)
          skipCount++
          continue
        }
        
        // 2. 上传文件到预签名URL
        const presignedUrl = checkResult.data.presignedUrl
        const objectKey = checkResult.data.objectKey
        
        if (!presignedUrl) {
          notificationToast.value?.error(`文件 ${file.name} 没有获取到上传URL`)
          errorCount++
          continue
        }
        
        // 上传到预签名URL
        const uploadResponse = await fetch(presignedUrl, {
          method: 'PUT',  // 预签名URL通常使用PUT
          body: file
        })
        
        if (!uploadResponse.ok) {
          notificationToast.value?.error(`文件 ${file.name} 上传失败`)
          errorCount++
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
          notificationToast.value?.error(`文件 ${file.name} 确认上传失败: ${confirmResult.msg}`)
          errorCount++
        } else {
          successCount++
        }
      } catch (error) {
        console.error(`Upload file ${file.name} error:`, error)
        notificationToast.value?.error(`文件 ${file.name} 上传出错`)
        errorCount++
      }
    }
    
    // 所有文件处理完成后，显示总结信息并重新加载文件夹内容
    if (successCount > 0) {
      notificationToast.value?.success(`成功上传 ${successCount} 个文件`)
    }
    if (skipCount > 0 && errorCount === 0) {
      // 只有跳过没有错误时，不显示通知，因为已经有警告通知了
    }
    
    uploadModalVisible.value = false
    loadFolderContents(store.state.currentPath)
  } catch (error) {
    console.error('Upload error:', error)
    notificationToast.value?.error('上传过程中出错，请检查网络连接')
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
      // 创建成功不显示通知，直接关闭模态框和刷新列表
      folderModalVisible.value = false
      loadFolderContents(store.state.currentPath)
    } else {
      notificationToast.value?.error('创建失败：' + result.msg)
    }
  } catch (error) {
    console.error('Create folder error:', error)
    notificationToast.value?.error('创建失败，请检查网络连接')
  }
}

// ===== 下载相关处理函数（完全重构为前端队列） =====

// 处理批量下载（新的前端队列方式）
const handleBatchDownload = async (selectedItems: any[]) => {
  if (selectedItems.length === 0) {
    notificationToast.value?.warning('请先选择要下载的文件')
    return
  }

  try {
    console.log(`开始处理批量下载: ${selectedItems.length} 个项目`)
    
    // 使用新的智能下载策略
    const result = await FileDownloadService.smartDownloadMultipleFiles(selectedItems)
    
    console.log('下载策略:', result.strategy)
    
    if (result.strategy === 'queue' || result.strategy === 'single_large_queue') {
      // 使用前端队列下载
      if (result.queueIds && result.queueIds.length > 0) {
        console.log(`已添加 ${result.queueIds.length} 个文件到前端队列`)
        // 不需要显示模态框，用户可以在右下角的队列管理器中查看进度
      }
    } else if (result.strategy === 'zip') {
      // ZIP下载已经自动完成
      console.log('ZIP文件下载完成')
    } else if (result.strategy === 'single_small') {
      // 单个小文件直接下载已完成
      console.log('小文件直接下载完成')
    }
    
  } catch (error: any) {
    console.error('批量下载失败:', error)
    notificationToast.value?.error('下载失败：' + (error?.message || error))
  }
}

// 处理批量删除
const handleBatchDelete = async (selectedItems: any[]) => {
  if (selectedItems.length === 0) {
    notificationToast.value?.warning('请先选择要删除的文件')
    return
  }

  showConfirmDialog(
    '确认批量删除',
    `确定要删除选中的 ${selectedItems.length} 个项目吗？此操作不可恢复。`,
    async () => {
      try {
        const paths = selectedItems.map(item => item.path || 
          (store.state.currentPath === '/' ? `/${item.name}` : `${store.state.currentPath}/${item.name}`)
        )

        const response = await fetch(`${config.apiBaseUrl}/files/batch-delete`, {
          method: 'POST',
          body: JSON.stringify({
            paths: paths
          }),
          ...AuthService.createAuthFetchOptions()
        })

        const result = await response.json()

        if (result.code === 20000) {
          // 批量删除成功不显示通知，直接刷新列表
          loadFolderContents(store.state.currentPath)
        } else {
          notificationToast.value?.error('批量删除失败：' + result.msg)
        }
      } catch (error) {
        console.error('批量删除失败:', error)
        notificationToast.value?.error('批量删除失败，请检查网络连接')
      }
    }
  )
}

// 处理开始监控下载（用于单个大文件）
const handleStartMonitoredDownload = async (downloadData: {
  file: any;
  url?: string;
  filename?: string;
  size?: number;
}) => {
  try {
    // 如果是大文件或者没有直接下载链接，添加到前端队列
    const fileSize = downloadData.size || downloadData.file.size
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB
    
    if (fileSize >= LARGE_FILE_THRESHOLD) {
      console.log('大文件添加到前端队列:', downloadData.file.name)
      await FileDownloadService.addFilesToQueue([downloadData.file])
    } else {
      // 小文件直接下载
      const result = await FileDownloadService.smartDownloadSingleFile(downloadData.file)
      console.log('小文件直接下载完成:', downloadData.file.name)
    }
  } catch (error: any) {
    console.error('启动下载失败:', error)
    notificationToast.value?.error('启动下载失败：' + (error?.message || error))
  }
}

// 处理下载完成（保留兼容性）
const handleDownloadComplete = (downloadInfo: {
  id: string;
  filename: string;
  size: number;
  duration: number;
}) => {
  console.log('下载完成:', downloadInfo)
}

// 处理下载错误（保留兼容性）
const handleDownloadError = (error: {
  id: string;
  filename: string;
  error: string;
  canRetry: boolean;
}) => {
  console.error('下载错误:', error)
}

// 保留一些旧函数以维持兼容性，但实际不再使用
const closeDownloadModal = () => {
  downloadModalVisible.value = false
  downloadLoading.value = false
}

const handleDownloadConfirm = async () => {
  // 这个函数保留但不再使用，因为我们使用前端队列
}

const handleCancelQueue = async () => {
  // 这个函数保留但不再使用
}

// 处理确认对话框的操作
const handleConfirmAction = async () => {
  if (confirmModalCallback.value) {
    try {
      confirmModalCallback.value()
    } catch (error) {
      console.error('确认操作失败:', error)
      notificationToast.value?.error('确认操作失败，请检查网络连接')
    }
  }
  
  confirmModalVisible.value = false
  confirmModalCallback.value = null
}

// 显示确认对话框
const showConfirmDialog = (title: string, message: string, callback: () => void) => {
  confirmModalTitle.value = title
  confirmModalMessage.value = message
  confirmModalCallback.value = callback
  confirmModalVisible.value = true
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
