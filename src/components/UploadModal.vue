<template>
  <div v-if="visible" class="modal">
    <div class="modal-content">
      <span class="close" @click="$emit('close')">&times;</span>
      <h3>上传文件</h3>
      <div 
        class="upload-area" 
        :class="{ 'dragover': isDragging }"
        @click="triggerFileInput"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="handleDrop"
      >
        <p>拖拽文件到此处或点击选择文件</p>
        <input 
          type="file" 
          ref="fileInput" 
          multiple 
          style="display: none;"
          @change="handleFileSelect"
        >
      </div>
      
      <!-- 上传列表 -->
      <div v-if="uploads.length > 0" class="upload-list">
        <div v-for="(upload, index) in uploads" :key="index" class="upload-item">
          <div class="upload-item-info">
            <div class="file-icon">
              <img :src="getFileIcon(upload.file.name)" alt="文件图标" />
            </div>
            <div class="file-name">{{ upload.file.name }}</div>
            <div class="file-size">{{ formatFileSize(upload.file.size) }}</div>
            <div class="upload-status" :class="`status-${upload.status}`">
              {{ getStatusText(upload.status) }}
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${upload.progress}%` }"></div>
          </div>
          <div v-if="upload.error" class="upload-error">
            <span class="error-message">{{ upload.error }}</span>
          </div>
          <div class="upload-actions">
            <button 
              v-if="upload.status === 'pending' || upload.status === 'paused'" 
              @click="startUpload(index)" 
              class="action-btn start-btn"
            >
              {{ upload.status === 'pending' ? '开始' : '继续' }}
            </button>
            <button 
              v-if="upload.status === 'uploading'" 
              @click="pauseUpload(index)" 
              class="action-btn pause-btn"
            >
              暂停
            </button>
            <button 
              v-if="upload.status !== 'completed' && upload.status !== 'error'" 
              @click="cancelUpload(index)" 
              class="action-btn cancel-btn"
            >
              取消
            </button>
            <button 
              v-if="upload.status === 'error'" 
              @click="retryUpload(index)" 
              class="action-btn retry-btn"
            >
              重试
            </button>
          </div>
        </div>
      </div>
      
      <div class="modal-actions">
        <button @click="startAllUploads" class="btn-primary" :disabled="!hasPendingUploads">开始全部</button>
        <button @click="$emit('close')" class="btn-secondary">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import optimizedFileUploadService from '@/services/FileUploadService'

// 上传状态类型
type UploadStatus = 'pending' | 'uploading' | 'paused' | 'completed' | 'error'

// 上传项接口
interface UploadItem {
  file: File
  progress: number
  status: UploadStatus
  error?: string
  uploadedChunks: number[]
  isLargeFile: boolean
  uploadPromise?: Promise<any>
  abortController?: AbortController
}

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  }
})

const $emit = defineEmits(['close', 'upload-complete'])
const store = useStore()

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const uploads = ref<UploadItem[]>([])

// 是否有待上传的文件
const hasPendingUploads = computed(() => {
  return uploads.value.some(upload => 
    upload.status === 'pending' || upload.status === 'paused'
  )
})

// 触发文件选择
const triggerFileInput = () => {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    addFilesToUploadQueue(input.files)
    // 清空input以便再次选择相同文件
    input.value = ''
  }
}

// 处理拖放文件
const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  if (event.dataTransfer?.files) {
    addFilesToUploadQueue(event.dataTransfer.files)
  }
}

// 添加文件到上传队列
const addFilesToUploadQueue = (files: FileList) => {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    uploads.value.push({
      file: file,
      progress: 0,
      status: 'pending',
      uploadedChunks: [],
      isLargeFile: false // 优化上传服务会自动选择最佳方式
    })
  }
}

// 开始上传单个文件
const startUpload = async (index: number) => {
  const upload = uploads.value[index]
  if (!upload || (upload.status !== 'pending' && upload.status !== 'paused')) {
    return
  }
  
  upload.status = 'uploading'
  
  // 创建一个 AbortController 以支持取消上传
  upload.abortController = new AbortController()
  
  try {
    // 使用优化的文件上传服务
    const uploadPromise = optimizedFileUploadService.uploadFile(
      upload.file,
      store.state.currentPath,
      {
        onProgress: (progress) => {
          upload.progress = progress
        },
        signal: upload.abortController.signal
      }
    )
    
    upload.uploadPromise = uploadPromise
    
    const result = await uploadPromise
    upload.progress = 100
    upload.status = 'completed'
    
    // 检查是否所有文件都已完成
    checkAllCompleted()
  } catch (error: any) {
    console.error('Upload error:', error)
    
    // 检查是否是因为中止而失败
    if (error.name === 'AbortError') {
      upload.status = 'paused'
    } else {
      upload.status = 'error'
      upload.error = error instanceof Error ? error.message : String(error)
    }
  } finally {
    // 清理 AbortController
    upload.abortController = undefined
  }
}

// 暂停上传
const pauseUpload = (index: number) => {
  const upload = uploads.value[index]
  if (upload && upload.status === 'uploading' && upload.abortController) {
    // 中止当前的上传请求
    upload.abortController.abort()
    upload.status = 'paused'
  }
}

// 取消上传
const cancelUpload = async (index: number) => {
  const upload = uploads.value[index]
  if (!upload) return
  
  // 中止任何正在进行的上传
  if (upload.abortController) {
    upload.abortController.abort()
  }
  
  // 从队列中移除
  uploads.value.splice(index, 1)
}

// 重试上传
const retryUpload = (index: number) => {
  const upload = uploads.value[index]
  if (upload && upload.status === 'error') {
    upload.status = 'pending'
    upload.error = undefined
    startUpload(index)
  }
}

// 开始所有待上传的文件
const startAllUploads = () => {
  uploads.value.forEach((upload, index) => {
    if (upload.status === 'pending' || upload.status === 'paused') {
      startUpload(index)
    }
  })
}

// 检查是否所有文件都已完成
const checkAllCompleted = () => {
  const allCompleted = uploads.value.every(
    upload => upload.status === 'completed' || upload.status === 'error'
  )
  
  if (allCompleted && uploads.value.some(upload => upload.status === 'completed')) {
    $emit('upload-complete')
    
    // 自动清理已完成的文件
    setTimeout(() => {
      uploads.value = uploads.value.filter(upload => upload.status !== 'completed');
    }, 3000);
  }
}

// 获取文件图标
const getFileIcon = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // 根据文件扩展名返回对应图标
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return '/icons/image.svg';
    case 'pdf':
      return '/icons/pdf.svg';
    case 'doc':
    case 'docx':
      return '/icons/doc.svg';
    case 'xls':
    case 'xlsx':
      return '/icons/xls.svg';
    case 'ppt':
    case 'pptx':
      return '/icons/ppt.svg';
    case 'mp3':
    case 'wav':
    case 'ogg':
      return '/icons/audio.svg';
    case 'mp4':
    case 'webm':
    case 'avi':
    case 'mov':
      return '/icons/video.svg';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return '/icons/zip.svg';
    case 'txt':
    case 'md':
    case 'json':
    case 'xml':
      return '/icons/text.svg';
    default:
      return '/icons/file.svg';
  }
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取状态文本
const getStatusText = (status: UploadStatus): string => {
  switch (status) {
    case 'pending': return '等待上传'
    case 'uploading': return '上传中'
    case 'paused': return '已暂停'
    case 'completed': return '上传完成'
    case 'error': return '上传失败'
    default: return ''
  }
}
</script>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 30px;
  border-radius: 10px;
  width: 600px;
  max-width: 90%;
  max-height: 80vh;
  position: relative;
  overflow-y: auto;
}

.close {
  position: absolute;
  top: 15px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
  color: #888;
}

.close:hover {
  color: #333;
}

h3 {
  margin-bottom: 20px;
  color: #333;
}

.upload-area {
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  margin-bottom: 20px;
  transition: all 0.3s;
}

.upload-area:hover {
  border-color: #667eea;
}

.upload-area.dragover {
  border-color: #667eea;
  background-color: rgba(102, 126, 234, 0.05);
}

.upload-area p {
  color: #666;
  margin: 0;
}

.upload-list {
  margin-top: 20px;
  max-height: 300px;
  overflow-y: auto;
}

.upload-item {
  padding: 12px;
  border-radius: 8px;
  background-color: #f8f9fa;
  margin-bottom: 10px;
}

.upload-item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.file-icon {
  width: 24px;
  height: 24px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-icon img {
  max-width: 100%;
  max-height: 100%;
}

.file-name {
  flex-grow: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  margin: 0 12px;
  color: #666;
  white-space: nowrap;
}

.upload-status {
  color: #667eea;
  white-space: nowrap;
}

.status-pending {
  color: #757575;
}

.status-uploading {
  color: #2196f3;
}

.status-paused {
  color: #ff9800;
}

.status-completed {
  color: #4caf50;
}

.status-error {
  color: #f44336;
}

.chunk-info {
  font-size: 0.8em;
  opacity: 0.8;
}

.progress-bar {
  height: 8px;
  background-color: #eee;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s;
}

.upload-error {
  margin-bottom: 8px;
  padding: 4px 8px;
  background-color: rgba(244, 67, 54, 0.1);
  border-radius: 4px;
  font-size: 12px;
}

.error-message {
  color: #f44336;
  word-break: break-word;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.action-btn {
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 12px;
}

.start-btn {
  background-color: #4caf50;
  color: white;
}

.pause-btn {
  background-color: #ff9800;
  color: white;
}

.cancel-btn {
  background-color: #f44336;
  color: white;
}

.retry-btn {
  background-color: #2196f3;
  color: white;
}

.modal-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-primary {
  padding: 8px 16px;
  background-color: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background-color: #e0e0e0;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
