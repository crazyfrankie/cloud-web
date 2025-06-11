<template>
  <div class="file-preview">
    <!-- 加载状态 -->
    <div v-if="loading" class="preview-loading">
      <div class="loading-spinner"></div>
      <p>正在加载预览...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="preview-error">
      <div class="error-icon">⚠️</div>
      <p>{{ error }}</p>
      <button @click="retry" class="btn-retry">重试</button>
    </div>

    <!-- 预览内容 -->
    <div v-else-if="previewData" class="preview-content">
      <!-- 文本编辑器 -->
      <div v-if="previewData.fileType === 'text'" class="text-preview">
        <textarea
          v-if="!readonly"
          v-model="editableContent"
          class="text-editor"
          @input="handleContentChange"
          :placeholder="'开始编辑 ' + previewData.fileName"
        />
        <pre v-else class="text-display">{{ previewData.textContent }}</pre>
      </div>

      <!-- 图片预览 -->
      <div v-else-if="previewData.fileType === 'image'" class="image-preview">
        <img 
          :src="previewData.previewUrl" 
          :alt="previewData.fileName"
          class="preview-image"
          @error="handleImageError"
        />
      </div>

      <!-- KKFileView预览 (Office文档、PDF等) -->
      <div v-else-if="previewData.previewType === 'kkfileview'" class="kkfileview-preview">
        <iframe
          :src="previewData.previewUrl"
          class="kkfileview-iframe"
          frameborder="0"
          @load="handleIframeLoad"
          @error="handleIframeError"
        />
      </div>

      <!-- 视频预览 -->
      <div v-else-if="previewData.fileType === 'video'" class="video-preview">
        <video
          :src="previewData.previewUrl"
          class="preview-video"
          controls
          preload="metadata"
          @error="handleVideoError"
        >
          您的浏览器不支持视频播放
        </video>
      </div>

      <!-- 音频预览 -->
      <div v-else-if="previewData.fileType === 'audio'" class="audio-preview">
        <div class="audio-info">
          <div class="audio-icon">🎵</div>
          <div class="audio-name">{{ previewData.fileName }}</div>
        </div>
        <audio
          :src="previewData.previewUrl"
          class="preview-audio"
          controls
          preload="metadata"
          @error="handleAudioError"
        >
          您的浏览器不支持音频播放
        </audio>
      </div>

      <!-- PDF直接预览 -->
      <div v-else-if="previewData.fileType === 'pdf'" class="pdf-preview">
        <iframe
          :src="previewData.previewUrl + '#toolbar=1&navpanes=1&scrollbar=1'"
          class="pdf-iframe"
          frameborder="0"
          @error="handlePdfError"
        />
      </div>

      <!-- 不支持的文件类型 -->
      <div v-else class="unsupported-preview">
        <div class="unsupported-icon">📄</div>
        <p>此文件类型暂不支持在线预览</p>
        <p class="file-info">{{ previewData.fileName }} ({{ formatFileSize(previewData.size) }})</p>
        <button @click="downloadFile" class="btn-download">下载文件</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import config from '@/config'
import AuthService from '@/services/AuthService'
import type { PreviewData, FileItem } from '@/types/file'

interface Props {
  file?: FileItem
  fileId?: number
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: true
})

const emit = defineEmits<{
  contentChange: [content: string]
  error: [message: string]
}>()

// 状态管理
const loading = ref(false)
const error = ref('')
const previewData = ref<PreviewData | null>(null)
const editableContent = ref('')

// 计算属性
const targetFileId = computed(() => props.fileId || props.file?.id)

// 加载预览数据 - 先定义函数
const loadPreview = async () => {
  if (!targetFileId.value) {
    error.value = '无效的文件ID'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${config.apiBaseUrl}/files/${targetFileId.value}/preview`, {
      method: 'GET',
      ...AuthService.createAuthFetchOptions()
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()
    
    if (result.code === 20000) {
      previewData.value = result.data
      
      // 如果是文本文件，初始化编辑内容
      if (result.data.textContent !== undefined) {
        editableContent.value = result.data.textContent
      }
    } else {
      error.value = result.msg || '预览加载失败'
    }
  } catch (err: any) {
    console.error('Preview load error:', err)
    error.value = err.message || '网络错误，请检查连接'
  } finally {
    loading.value = false
  }
}

// 监听文件变化 - 函数定义后再设置监听器
watch(() => targetFileId.value, (newFileId) => {
  if (newFileId) {
    loadPreview()
  }
}, { immediate: true })

// 监听编辑内容变化
watch(() => editableContent.value, (newContent) => {
  if (!props.readonly) {
    emit('contentChange', newContent)
  }
})

// 重试加载
const retry = () => {
  loadPreview()
}

// 处理内容变化
const handleContentChange = () => {
  if (!props.readonly) {
    emit('contentChange', editableContent.value)
  }
}

// 错误处理函数
const handleImageError = () => {
  error.value = '图片加载失败'
}

const handleIframeLoad = () => {
  console.log('KKFileView iframe loaded successfully')
}

const handleIframeError = () => {
  error.value = 'KKFileView预览服务不可用，请检查服务状态'
}

const handleVideoError = () => {
  error.value = '视频播放失败，可能是格式不支持'
}

const handleAudioError = () => {
  error.value = '音频播放失败，可能是格式不支持'
}

const handlePdfError = () => {
  error.value = 'PDF预览失败'
}

// 下载文件
const downloadFile = async () => {
  if (!targetFileId.value) return

  try {
    window.open(`${config.apiBaseUrl}/files/${targetFileId.value}/download`, '_blank')
  } catch (err) {
    console.error('Download error:', err)
    error.value = '下载失败'
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

// 组件挂载时加载预览
onMounted(() => {
  if (targetFileId.value) {
    loadPreview()
  }
})

// 暴露方法供父组件调用
defineExpose({
  loadPreview,
  getEditableContent: () => editableContent.value,
  setEditableContent: (content: string) => {
    editableContent.value = content
  }
})
</script>

<style scoped>
.file-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
}

.preview-loading, .preview-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-left: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.preview-error {
  color: #ef4444;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.btn-retry {
  margin-top: 16px;
  padding: 8px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-retry:hover {
  background-color: #2563eb;
}

.preview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 文本预览样式 */
.text-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.text-editor {
  flex: 1;
  width: 100%;
  padding: 20px;
  border: none;
  outline: none;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  background-color: #f8fafc;
}

.text-display {
  flex: 1;
  padding: 20px;
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow: auto;
  background-color: #f8fafc;
}

/* 图片预览样式 */
.image-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: #000;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

/* KKFileView预览样式 */
.kkfileview-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.kkfileview-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background-color: #f5f5f5;
}

/* 视频预览样式 */
.video-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: #000;
}

.preview-video {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
}

/* 音频预览样式 */
.audio-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.audio-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
}

.audio-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.audio-name {
  font-size: 18px;
  font-weight: 500;
  text-align: center;
}

.preview-audio {
  width: 100%;
  max-width: 400px;
}

/* PDF预览样式 */
.pdf-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pdf-iframe {
  flex: 1;
  width: 100%;
  border: none;
}

/* 不支持的文件类型样式 */
.unsupported-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #6b7280;
}

.unsupported-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.unsupported-preview p {
  margin-bottom: 8px;
  text-align: center;
}

.file-info {
  font-size: 14px;
  color: #9ca3af;
  margin-bottom: 20px;
}

.btn-download {
  padding: 10px 20px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-download:hover {
  background-color: #2563eb;
}
</style>