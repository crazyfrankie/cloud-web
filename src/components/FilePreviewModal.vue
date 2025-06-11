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
          <!-- 编辑按钮 -->
          <button 
            v-if="canEdit && !isEditing" 
            class="btn-edit" 
            @click="startEdit"
            :disabled="loading"
          >
            <span class="btn-icon">✏️</span>
            编辑
          </button>
          
          <!-- 保存按钮 -->
          <button 
            v-if="isEditing" 
            class="btn-save" 
            @click="saveEdit"
            :disabled="saving || !hasChanges"
          >
            <span class="btn-icon">💾</span>
            {{ saving ? '保存中...' : '保存' }}
          </button>
          
          <!-- 取消编辑按钮 -->
          <button 
            v-if="isEditing" 
            class="btn-cancel" 
            @click="cancelEdit"
            :disabled="saving"
          >
            <span class="btn-icon">❌</span>
            取消
          </button>
          
          <!-- 下载按钮 -->
          <button 
            class="btn-download" 
            @click="downloadFile"
            :disabled="loading"
          >
            <span class="btn-icon">📥</span>
            下载
          </button>
          
          <!-- KKFileView健康检查按钮 -->
          <button 
            v-if="isKKFileViewPreview"
            class="btn-health-check" 
            @click="checkKKFileViewHealth"
            :disabled="healthChecking"
            :title="'检查KKFileView服务状态'"
          >
            <span class="btn-icon">🔍</span>
            {{ healthChecking ? '检查中...' : '服务检查' }}
          </button>
          
          <!-- 关闭按钮 -->
          <button class="btn-close" @click="close">
            <span class="btn-icon">✕</span>
            关闭
          </button>
        </div>
      </div>

      <!-- 预览内容区域 -->
      <div class="preview-content" :class="{ 'editing': isEditing }">
        <FilePreview
          ref="filePreviewRef"
          :file-id="targetFileId"
          :readonly="!isEditing"
          @content-change="handleContentChange"
          @error="handlePreviewError"
        />
      </div>

      <!-- 状态栏 -->
      <div class="preview-footer" v-if="showStatusBar">
        <div class="status-info">
          <span v-if="isEditing && hasChanges" class="status-modified">已修改</span>
          <span v-if="lastSaved" class="status-saved">上次保存: {{ lastSaved }}</span>
          <span v-if="previewError" class="status-error">{{ previewError }}</span>
        </div>
        <div class="shortcut-hints" v-if="isEditing">
          <span class="shortcut">Ctrl+S 保存</span>
          <span class="shortcut">Esc 取消</span>
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
  fileUpdated: [fileId: number]
}>()

// 组件引用
const filePreviewRef = ref<InstanceType<typeof FilePreview> | null>(null)
const notificationToast = ref<InstanceType<typeof NotificationToast> | null>(null)

// 状态管理
const loading = ref(false)
const isEditing = ref(false)
const saving = ref(false)
const healthChecking = ref(false)
const editedContent = ref('')
const originalContent = ref('')
const lastSaved = ref('')
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

const canEdit = computed(() => {
  return previewData.value?.isEditable || false
})

const hasChanges = computed(() => {
  return editedContent.value !== originalContent.value
})

const isKKFileViewPreview = computed(() => {
  return previewData.value?.previewType === 'kkfileview'
})

const showStatusBar = computed(() => {
  return isEditing.value || previewError.value || lastSaved.value
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
  isEditing.value = false
  saving.value = false
  editedContent.value = ''
  originalContent.value = ''
  previewError.value = ''
  lastSaved.value = ''
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
        if (result.data.textContent !== undefined) {
          originalContent.value = result.data.textContent
          editedContent.value = result.data.textContent
        }
      }
    }
  } catch (err) {
    console.error('Failed to load preview data:', err)
  }
}

// 开始编辑
const startEdit = () => {
  if (!canEdit.value) return
  isEditing.value = true
  previewError.value = ''
}

// 取消编辑
const cancelEdit = () => {
  if (hasChanges.value) {
    if (confirm('有未保存的更改，确定要取消编辑吗？')) {
      isEditing.value = false
      editedContent.value = originalContent.value
      filePreviewRef.value?.setEditableContent(originalContent.value)
    }
  } else {
    isEditing.value = false
  }
}

// 保存编辑
const saveEdit = async () => {
  if (!targetFileId.value || saving.value || !hasChanges.value) return

  saving.value = true

  try {
    // 1. 准备更新
    const prepareResponse = await fetch(`${config.apiBaseUrl}/files/${targetFileId.value}/content/prepare`, {
      method: 'POST',
      body: JSON.stringify({
        content: editedContent.value
      }),
      ...AuthService.createAuthFetchOptions()
    })

    AuthService.handleResponse(prepareResponse)
    const prepareResult = await prepareResponse.json()
    
    if (prepareResult.code !== 20000) {
      throw new Error(prepareResult.msg || '准备更新失败')
    }

    // 2. 上传新内容
    const uploadResponse = await fetch(prepareResult.data.presignedUrl, {
      method: 'PUT',
      body: editedContent.value,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })

    if (!uploadResponse.ok) {
      throw new Error('内容上传失败')
    }

    // 3. 确认更新
    const confirmResponse = await fetch(`${config.apiBaseUrl}/files/${targetFileId.value}/content/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        hash: prepareResult.data.newHash,
        size: prepareResult.data.newSize
      }),
      ...AuthService.createAuthFetchOptions()
    })

    AuthService.handleResponse(confirmResponse)
    const confirmResult = await confirmResponse.json()
    
    if (confirmResult.code !== 20000) {
      throw new Error(confirmResult.msg || '确认更新失败')
    }

    // 更新成功
    originalContent.value = editedContent.value
    isEditing.value = false
    lastSaved.value = new Date().toLocaleTimeString()
    
    if (previewData.value) {
      previewData.value.textContent = editedContent.value
      previewData.value.size = prepareResult.data.newSize
    }
    
    notificationToast.value?.success('文件保存成功')
    emit('fileUpdated', targetFileId.value)

  } catch (err: any) {
    console.error('Save edit error:', err)
    notificationToast.value?.error('保存失败：' + (err.message || err))
  } finally {
    saving.value = false
  }
}

// 处理内容变化
const handleContentChange = (content: string) => {
  editedContent.value = content
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

// 检查KKFileView健康状态
const checkKKFileViewHealth = async () => {
  healthChecking.value = true

  try {
    const response = await fetch(`${config.apiBaseUrl}/files/preview/health`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })

    AuthService.handleResponse(response)
    const result = await response.json()
    
    if (result.code === 20000) {
      notificationToast.value?.success('KKFileView服务运行正常')
    } else {
      notificationToast.value?.warning('KKFileView服务状态异常')
    }
  } catch (err: any) {
    console.error('Health check error:', err)
    notificationToast.value?.error('KKFileView服务不可用')
  } finally {
    healthChecking.value = false
  }
}

// 关闭预览
const close = () => {
  if (isEditing.value && hasChanges.value) {
    if (confirm('有未保存的更改，确定要关闭吗？')) {
      emit('close')
    }
  } else {
    emit('close')
  }
}

// 处理遮罩层点击
const handleOverlayClick = () => {
  close()
}

// 键盘快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  if (!props.visible) return

  if (event.ctrlKey || event.metaKey) {
    switch (event.key) {
      case 's':
      case 'S':
        event.preventDefault()
        if (isEditing.value && hasChanges.value) {
          saveEdit()
        }
        break
    }
  } else if (event.key === 'Escape') {
    if (isEditing.value) {
      cancelEdit()
    } else {
      close()
    }
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

.btn-edit {
  background-color: #3b82f6;
  color: white;
}

.btn-edit:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-save {
  background-color: #10b981;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background-color: #059669;
}

.btn-cancel {
  background-color: #6b7280;
  color: white;
}

.btn-cancel:hover:not(:disabled) {
  background-color: #4b5563;
}

.btn-download {
  background-color: #8b5cf6;
  color: white;
}

.btn-download:hover:not(:disabled) {
  background-color: #7c3aed;
}

.btn-health-check {
  background-color: #f59e0b;
  color: white;
}

.btn-health-check:hover:not(:disabled) {
  background-color: #d97706;
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

.preview-content.editing {
  background-color: #f8fafc;
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

.status-modified {
  color: #f59e0b;
  font-weight: 500;
}

.status-saved {
  color: #10b981;
}

.status-error {
  color: #ef4444;
}

.shortcut-hints {
  display: flex;
  gap: 12px;
}

.shortcut {
  padding: 2px 6px;
  background-color: #e5e7eb;
  border-radius: 4px;
  color: #4b5563;
  font-family: monospace;
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

  .shortcut-hints {
    justify-content: center;
  }
}
</style>