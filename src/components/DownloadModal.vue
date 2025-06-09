<template>
  <div v-if="visible" class="download-modal-overlay" @click="$emit('close')">
    <div class="download-modal" @click.stop>
      <div class="modal-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <div class="modal-body">
        <div v-if="type === 'large-files'" class="large-files-warning">
          <div class="warning-icon">⚠️</div>
          <div class="warning-content">
            <h4>文件较大，将使用下载队列</h4>
            <p>您选择的文件总大小为 <strong>{{ formatFileSize(totalSize) }}</strong>，超过了100MB的限制。</p>
            <p>系统将使用下载队列进行处理，您可以在下载队列中查看进度。</p>
            
            <div class="file-summary">
              <p>文件数量：<strong>{{ fileCount }}</strong> 个</p>
              <p>总大小：<strong>{{ formatFileSize(totalSize) }}</strong></p>
              <p v-if="zipName">ZIP文件名：<strong>{{ zipName }}</strong></p>
            </div>
          </div>
        </div>
        
        <div v-else-if="type === 'confirm'" class="download-confirm">
          <div class="confirm-icon">📥</div>
          <div class="confirm-content">
            <h4>确认下载</h4>
            <p>即将下载 <strong>{{ fileCount }}</strong> 个文件，总大小 <strong>{{ formatFileSize(totalSize) }}</strong>。</p>
            
            <div class="download-options">
              <div class="option">
                <input 
                  type="radio" 
                  id="individual" 
                  value="individual" 
                  v-model="downloadMethod"
                >
                <label for="individual">分别下载（每个文件单独下载）</label>
              </div>
              <div class="option">
                <input 
                  type="radio" 
                  id="zip" 
                  value="zip" 
                  v-model="downloadMethod"
                >
                <label for="zip">打包下载（创建ZIP文件）</label>
              </div>
            </div>
            
            <div v-if="downloadMethod === 'zip'" class="zip-name-input">
              <label>ZIP文件名：</label>
              <input 
                type="text" 
                v-model="customZipName" 
                :placeholder="defaultZipName"
                @keyup.enter="handleConfirm"
              >
              <small>.zip扩展名将自动添加</small>
            </div>
          </div>
        </div>
        
        <div v-else-if="type === 'processing'" class="download-processing">
          <div class="loading-spinner"></div>
          <div class="processing-content">
            <h4>正在处理下载...</h4>
            <p>{{ processingMessage }}</p>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" @click="$emit('close')">取消</button>
        <button 
          v-if="type === 'large-files'" 
          class="btn-primary" 
          @click="handleConfirm"
          :disabled="loading"
        >
          {{ loading ? '处理中...' : '添加到下载队列' }}
        </button>
        <button 
          v-else-if="type === 'confirm'" 
          class="btn-primary" 
          @click="handleConfirm"
          :disabled="!downloadMethod || loading"
        >
          {{ loading ? '处理中...' : '开始下载' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  visible: boolean
  type: 'large-files' | 'confirm' | 'processing'
  title?: string
  totalSize: number
  fileCount: number
  zipName?: string
  processingMessage?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '下载确认',
  processingMessage: '正在准备文件...',
  loading: false
})

const emit = defineEmits(['close', 'confirm'])

const downloadMethod = ref<'individual' | 'zip'>('zip')
const customZipName = ref('')

const defaultZipName = computed(() => {
  return props.zipName || `download_${props.fileCount}_files`
})

const finalZipName = computed(() => {
  return customZipName.value.trim() || defaultZipName.value
})

// 当对话框显示时重置状态
watch(() => props.visible, (visible) => {
  if (visible) {
    downloadMethod.value = props.fileCount > 1 ? 'zip' : 'individual'
    customZipName.value = ''
  }
})

const handleConfirm = () => {
  if (props.type === 'large-files') {
    emit('confirm', {
      method: 'queue',
      zipName: props.zipName
    })
  } else if (props.type === 'confirm') {
    emit('confirm', {
      method: downloadMethod.value,
      zipName: downloadMethod.value === 'zip' ? finalZipName.value : undefined
    })
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<style scoped>
.download-modal-overlay {
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

.download-modal {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  background-color: #f9f9f9;
}

.modal-header h3 {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 24px;
  max-height: 60vh;
  overflow-y: auto;
}

.large-files-warning {
  display: flex;
  gap: 16px;
}

.warning-icon {
  font-size: 48px;
  flex-shrink: 0;
}

.warning-content h4 {
  margin: 0 0 12px 0;
  color: #e67e22;
  font-size: 16px;
}

.warning-content p {
  margin: 0 0 8px 0;
  color: #666;
  line-height: 1.5;
}

.file-summary {
  background-color: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
}

.file-summary p {
  margin: 4px 0;
  color: #495057;
}

.download-confirm {
  display: flex;
  gap: 16px;
}

.confirm-icon {
  font-size: 48px;
  flex-shrink: 0;
}

.confirm-content h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 16px;
}

.download-options {
  margin: 16px 0;
}

.option {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}

.option input[type="radio"] {
  margin: 0;
}

.option label {
  cursor: pointer;
  color: #333;
}

.zip-name-input {
  margin-top: 16px;
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.zip-name-input label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.zip-name-input input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.zip-name-input small {
  display: block;
  margin-top: 4px;
  color: #666;
  font-size: 12px;
}

.download-processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.processing-content h4 {
  margin: 0 0 8px 0;
  color: #333;
}

.processing-content p {
  margin: 0;
  color: #666;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #eee;
  background-color: #f9f9f9;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn-primary:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #ecf0f1;
  color: #333;
}

.btn-secondary:hover {
  background-color: #d5dbdb;
}
</style>
