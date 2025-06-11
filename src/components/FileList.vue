<template>
  <div class="file-list-container">
    <div class="file-header">
      <div class="file-name">
        <input type="checkbox" id="selectAllCheckbox" @change="toggleSelectAll">
        名称
      </div>
      <div class="file-size">大小</div>
      <div class="file-date">修改时间</div>
      <div class="file-actions">操作</div>
    </div>
    
    <!-- 批量操作工具栏 -->
    <div v-if="selectedFiles.length > 0" class="batch-toolbar">
      <div class="selected-info">
        已选择 {{ selectedFiles.length }} 项
      </div>
      <div class="batch-actions">
        <button class="batch-btn download" @click="handleBatchDownload">
          批量下载
        </button>
        <button class="batch-btn delete" @click="handleBatchDelete">
          批量删除
        </button>
        <button class="batch-btn clear" @click="clearSelection">
          清除选择
        </button>
      </div>
    </div>
    
    <div v-if="loading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>
    
    <div v-else-if="files.length === 0" class="empty-container">
      <p>当前文件夹为空</p>
    </div>
    
    <div v-else class="file-list-content">
      <div 
        v-for="file in files" 
        :key="file.id" 
        class="file-item"
        :class="{ 'selected': selectedFiles.includes(file.id) }"
      >
        <div class="file-name">
          <input 
            type="checkbox" 
            :id="`file-${file.id}`" 
            :value="file.id" 
            v-model="selectedFiles"
          >
          <div 
            class="file-icon" 
            :class="{ 'folder-icon': file.type === 'folder' }"
            @click="file.type === 'folder' ? $emit('navigate', file) : null"
          >
            <img :src="getFileIcon(file)" alt="文件图标">
          </div>
          <span 
            class="file-label"
            :class="{ 
              'folder-name': file.type === 'folder',
              'file-name': file.type !== 'folder'
            }"
            @click="handleFileClick(file)"
          >
            {{ file.name }}
          </span>
        </div>
        <div class="file-size">{{ formatFileSize(file.size || 0) }}</div>
        <div class="file-date">{{ formatDate(file.updateTime || '') }}</div>
        <div class="file-actions">
          <button v-if="file.type !== 'folder'" class="action-btn download" @click="handleDownload(file)">
            下载
          </button>
          <button class="action-btn" @click="$emit('rename', file)">
            重命名
          </button>
          <button class="action-btn delete" @click="$emit('delete', file)">
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileDownloadService from '@/services/FileDownloadService'

// 定义文件对象类型
interface FileItem {
  id: string | number
  name: string
  size?: number
  path?: string
  type: string
  isDir?: boolean
  updateTime?: string
}

const props = defineProps<{
  files: FileItem[]
  loading?: boolean
}>()

// 定义事件
const emit = defineEmits(['navigate', 'preview', 'delete', 'rename', 'batch-download', 'batch-delete', 'start-monitored-download'])

const selectedFiles = ref<Array<string | number>>([])

// 清除选择
const clearSelection = () => {
  selectedFiles.value = []
}

// 处理批量下载
const handleBatchDownload = async () => {
  if (selectedFiles.value.length === 0) return
  
  const selectedItems = props.files.filter(file => 
    selectedFiles.value.includes(file.id)
  )
  
  try {
    // 如果只选择了一个文件，使用单文件下载逻辑
    if (selectedItems.length === 1) {
      const file = selectedItems[0]
      await handleDownload(file)
      clearSelection()
      return
    }
    
    // 多个文件：使用智能下载策略
    console.log('开始批量下载:', selectedItems)
    
    // 将文件信息转换为FileInfo格式
    const fileInfos = selectedItems.map(file => ({
      id: typeof file.id === 'string' ? parseInt(file.id, 10) : file.id,
      name: file.name,
      size: file.size || 0,
      path: file.path || '',
      isDir: file.type === 'folder' || file.isDir || false,
      type: file.type || 'file'
    }))
    
    // 使用智能下载多文件方法
    const result = await FileDownloadService.smartDownloadMultipleFiles(fileInfos)
    
    console.log('下载策略结果:', result)
    
    if (result.strategy === 'queue' || result.strategy === 'single_large_queue') {
      // 队列下载：文件已经添加到前端队列
      console.log('文件已添加到下载队列')
    } else if (result.strategy === 'zip') {
      // ZIP下载：直接下载完成
      console.log('ZIP文件下载完成')
    } else if (result.strategy === 'single_small') {
      // 单个小文件直接下载完成
      console.log('小文件直接下载完成')
    }
    
  } catch (error) {
    console.error('批量下载失败:', error)
    alert('批量下载失败: ' + (error as Error).message)
  } finally {
    clearSelection()
  }
}

// 处理批量删除
const handleBatchDelete = () => {
  if (selectedFiles.value.length === 0) return
  
  const selectedItems = props.files.filter(file => 
    selectedFiles.value.includes(file.id)
  )
  
  emit('batch-delete', selectedItems)
}

// 处理文件/文件夹点击
const handleFileClick = (file: any) => {
  if (file.type === 'folder' || file.isDir) {
    emit('navigate', file)
  } else {
    // 发射预览事件，让父组件处理文件预览
    emit('preview', file)
  }
}

// 判断文件是否支持预览
const canPreview = (file: any) => {
  if (!file || !file.name) return false
  if (file.type === 'folder' || file.isDir) return false
  
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : ''
  if (!extension) return false
  
  // 支持预览的文件类型 - 只支持基本格式
  const previewableTypes = [
    // 图片文件
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico',
    // PDF文件
    'pdf',
    // 视频文件
    'mp4', 'webm', 'avi', 'mkv', 'mov',
    // 音频文件
    'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'
  ]
  
  return previewableTypes.includes(extension)
}

// 处理文件下载
const downloadService = FileDownloadService

const handleDownload = async (file: any) => {
  try {
    // 验证文件对象
    if (!file) {
      console.error('文件对象为空')
      alert('文件信息异常，无法下载')
      return
    }

    if (!file.id) {
      console.error('文件ID缺失:', file)
      alert('文件ID缺失，无法下载')
      return
    }

    if (!file.name) {
      console.error('文件名缺失:', file)
      alert('文件名缺失，无法下载')
      return
    }

    if (file.type === 'folder' || file.isDir) {
      alert('不能下载文件夹')
      return
    }

    console.log('开始下载文件:', file)
    
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB
    const fileSize = file.size || 0
    
    if (fileSize >= LARGE_FILE_THRESHOLD) {
      // 大文件：通知父组件使用进度监控下载
      console.log('检测到大文件，使用进度监控下载:', file.name)
      
      // 构建V2下载URL
      const downloadUrl = `${downloadService.apiBaseUrl}/files/download/v2/${file.id}/stream`
      
      emit('start-monitored-download', {
        file: {
          id: file.id,
          name: file.name,
          size: fileSize,
          path: file.path || '',
          isDir: false,
          type: file.type || 'file'
        },
        url: downloadUrl,
        filename: file.name,
        size: fileSize
      })
    } else {
      // 小文件：直接下载
      console.log('检测到小文件，使用直接下载:', file.name)
      await downloadService.smartDownloadSingleFile({
        id: file.id,
        name: file.name,
        size: fileSize,
        path: file.path || '',
        isDir: false,
        type: file.type || 'file'
      })
    }
  } catch (error) {
    console.error('下载失败:', error)
    // 可以在这里显示错误提示
    alert('下载失败: ' + (error as Error).message)
  }
}

// 格式化文件大小
const formatFileSize = (bytes: number) => {
  if (bytes === undefined || bytes === null) return '-'
  if (bytes === 0) return '-'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化日期
const formatDate = (dateString: string) => {
  if (!dateString) return '-'
  
  try {
    const date = new Date(dateString)
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      return '-'
    }
    
    // 使用 toLocaleString 格式化日期
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return '-'
  }
}

// 获取文件图标
const getFileIcon = (file: any) => {
  if (!file || !file.type) {
    return '/icons/file.svg'
  }
  
  if (file.type === 'folder') {
    return '/icons/folder.svg'
  }
  
  // 根据文件扩展名返回不同图标
  if (!file.name) {
    return '/icons/file.svg'
  }
  
  try {
    const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : ''
    
    const iconMap: Record<string, string> = {
      pdf: '/icons/pdf.svg',
      doc: '/icons/doc.svg',
      docx: '/icons/doc.svg',
      xls: '/icons/xls.svg',
      xlsx: '/icons/xls.svg',
      ppt: '/icons/ppt.svg',
      pptx: '/icons/ppt.svg',
      jpg: '/icons/image.svg',
      jpeg: '/icons/image.svg',
      png: '/icons/image.svg',
      gif: '/icons/image.svg',
      mp3: '/icons/audio.svg',
      wav: '/icons/audio.svg',
      mp4: '/icons/video.svg',
      avi: '/icons/video.svg',
      mov: '/icons/video.svg',
      zip: '/icons/zip.svg',
      rar: '/icons/zip.svg',
      '7z': '/icons/zip.svg',
      txt: '/icons/text.svg',
      html: '/icons/html.svg',
      css: '/icons/css.svg',
      js: '/icons/js.svg',
      json: '/icons/json.svg',
      md: '/icons/md.svg'
    }
    
    return iconMap[extension] || '/icons/file.svg'
  } catch (error) {
    console.error('Error determining file icon:', error)
    return '/icons/file.svg'
  }
}

// 全选/取消全选
const toggleSelectAll = (event: Event) => {
  const target = event.target as HTMLInputElement
  
  if (target.checked) {
    selectedFiles.value = props.files.map(file => file.id)
  } else {
    selectedFiles.value = []
  }
}
</script>

<style scoped>
.file-list-container {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
}

.file-header {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  background-color: #f7f7f9;
  font-weight: bold;
  border-bottom: 1px solid #eee;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
  transition: background-color 0.2s;
}

.file-item:hover {
  background-color: #f9f9f9;
}

.file-item.selected {
  background-color: #f0f2ff;
}

.file-name {
  flex: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-icon {
  display: flex;
  align-items: center;
}

.file-icon img {
  width: 24px;
  height: 24px;
}

.folder-icon {
  cursor: pointer;
}

.file-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-name {
  color: #667eea;
  font-weight: 500;
  cursor: pointer;
}

.folder-name:hover {
  text-decoration: underline;
}

.file-name {
  color: #4a5568;
  cursor: pointer;
}

.file-name:hover {
  color: #667eea;
  text-decoration: underline;
}

.file-size {
  flex: 1;
  text-align: right;
}

.file-date {
  flex: 2;
  text-align: center;
}

.file-actions {
  flex: 2;
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

.action-btn {
  background: #f1f2f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #e9eaee;
}

.action-btn.download {
  color: #667eea;
  border-color: #667eea;
}

.action-btn.download:hover {
  background: #f0f2ff;
}

.action-btn.delete {
  color: #ff4757;
  border-color: #ff4757;
}

.action-btn.delete:hover {
  background: #fff0f0;
}

.loading-container {
  padding: 40px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 15px;
  border: 3px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-container {
  padding: 40px;
  text-align: center;
  color: #888;
}

/* 批量操作工具栏样式 */
.batch-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom: 1px solid #ddd;
}

.selected-info {
  font-weight: 500;
  font-size: 14px;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.batch-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.batch-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
}

.batch-btn.download:hover {
  background: rgba(46, 213, 115, 0.3);
}

.batch-btn.delete:hover {
  background: rgba(255, 71, 87, 0.3);
}

.batch-btn.clear:hover {
  background: rgba(255, 255, 255, 0.4);
}
</style>
