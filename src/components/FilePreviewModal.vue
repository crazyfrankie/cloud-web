<template>
  <div class="file-preview-modal" v-if="visible" @click="handleOverlayClick">
    <div class="preview-container" @click.stop>
      <!-- 预览头部 -->
      <div class="preview-header">
        <div class="file-info">
          <h3>{{ fileName }}</h3>
          <span class="file-size">{{ formattedFileSize }}</span>
        </div>
        <div class="preview-actions">
          <!-- 下载按钮 -->
          <button 
            class="btn-download" 
            @click="downloadFile"
            :disabled="loading"
          >
            <span class="btn-icon">📥</span>
            下载
          </button>
          
          <!-- 关闭按钮 -->
          <button class="btn-close" @click="close">
            <span class="btn-icon">✕</span>
            关闭
          </button>
        </div>
      </div>

      <!-- 预览内容区域 -->
      <div class="preview-content">
        <FilePreview
          ref="filePreviewRef"
          :file-id="targetFileId"
          @error="handlePreviewError"
        />
      </div>

      <!-- 状态栏 -->
      <div class="preview-footer" v-if="previewError">
        <div class="status-info">
          <span v-if="previewError" class="status-error">{{ previewError }}</span>
        </div>
      </div>
    </div>

    <!-- 通知组件 -->
    <notification-toast ref="notificationToast" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import FilePreview from './preview/FilePreview.vue'
import NotificationToast from './NotificationToast.vue'
import config from '@/config'
import AuthService from '@/services/AuthService'
import type { FileItem } from '@/types/file'

interface Props {
  visible: boolean
  file?: FileItem
  fileId?: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

// 组件引用
const filePreviewRef = ref<InstanceType<typeof FilePreview> | null>(null)
const notificationToast = ref<InstanceType<typeof NotificationToast> | null>(null)

// 状态管理
const loading = ref(false)
const previewError = ref('')
const previewData = ref<any>(null)

// 计算属性
const targetFileId = computed(() => props.fileId || props.file?.id)

const fileName = computed(() => {
  return previewData.value?.fileName || props.file?.name || '文件预览'
})

const formattedFileSize = computed(() => {
  const size = previewData.value?.size || props.file?.size || 0
  return formatFileSize(size)
})

// 监听属性变化
watch(() => [props.visible, props.file, props.fileId], 
  ([visible]) => {
    if (visible) {
      resetState()
      nextTick(() => {
        loadPreviewData()
      })
    }
  }, 
  { immediate: true }
)

// 重置状态
const resetState = () => {
  previewError.value = ''
}

// 加载预览数据
const loadPreviewData = async () => {
  if (!targetFileId.value) return

  try {
    const response = await fetch(`${config.apiBaseUrl}/files/${targetFileId.value}/preview`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })

    if (response.ok) {
      const result = await response.json()
      if (result.code === 20000) {
        previewData.value = result.data
      }
    }
  } catch (err) {
    console.error('Failed to load preview data:', err)
  }
}

// 处理预览错误
const handlePreviewError = (error: string) => {
  previewError.value = error
}

// 下载文件
const downloadFile = async () => {
  if (!targetFileId.value) return

  try {
    const response = await fetch(`${config.apiBaseUrl}/files/download`, {
      method: 'POST',
      body: JSON.stringify({
        fileIds: [targetFileId.value]
      }),
      ...AuthService.createAuthFetchOptions()
    })

    AuthService.handleResponse(response)

    if (response.ok) {
      const result = await response.json()
      if (result.code === 20000 && result.data.dlink) {
        const link = document.createElement('a')
        link.href = result.data.dlink
        link.download = fileName.value
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        notificationToast.value?.success('文件下载成功')
      } else {
        throw new Error(result.msg || '下载失败')
      }
    }
  } catch (err: any) {
    console.error('Download error:', err)
    notificationToast.value?.error('下载失败：' + (err.message || err))
  }
}

// 关闭预览
const close = () => {
  emit('close')
}

// 处理遮罩层点击
const handleOverlayClick = () => {
  close()
}

// 键盘快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  if (!props.visible) return

  if (event.key === 'Escape') {
    close()
  }
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 生命周期钩子
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.file-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.preview-container {
  background: white;
  border-radius: 12px;
  max-width: 95vw;
  max-height: 95vh;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: modalSlideIn 0.3s ease-out;
  overflow: hidden;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f9fafb;
  flex-shrink: 0;
}

.file-info h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: #6b7280;
}

.preview-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-actions button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  white-space: nowrap;
}

.btn-icon {
  font-size: 14px;
}

.btn-download {
  background-color: #8b5cf6;
  color: white;
}

.btn-download:hover:not(:disabled) {
  background-color: #7c3aed;
}

.btn-close {
  background-color: #ef4444;
  color: white;
}

.btn-close:hover {
  background-color: #dc2626;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #ffffff;
}

.preview-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  border-top: 1px solid #e5e7eb;
  background-color: #f9fafb;
  font-size: 12px;
  flex-shrink: 0;
}

.status-info {
  display: flex;
  gap: 16px;
}

.status-error {
  color: #ef4444;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .preview-header {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
  }

  .preview-actions {
    width: 100%;
    justify-content: center;
  }

  .preview-actions button {
    flex: 1;
    min-width: 0;
  }

  .file-info h3 {
    max-width: none;
    text-align: center;
  }

  .preview-footer {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }
}
</style>