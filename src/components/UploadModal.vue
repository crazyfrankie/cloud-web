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
      <div v-if="showProgress" class="upload-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
        </div>
        <span>{{ progress }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  }
})

const $emit = defineEmits(['close', 'upload'])

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const showProgress = ref(false)
const progress = ref(0)

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
    handleFiles(input.files)
  }
}

// 处理拖放文件
const handleDrop = (event: DragEvent) => {
  isDragging.value = false
  if (event.dataTransfer?.files) {
    handleFiles(event.dataTransfer.files)
  }
}

// 处理文件上传
const handleFiles = (files: FileList) => {
  if (files.length === 0) return
  
  // 显示上传进度
  showProgress.value = true
  progress.value = 0
  
  // 模拟上传进度
  const interval = setInterval(() => {
    progress.value += 5
    if (progress.value >= 100) {
      clearInterval(interval)
      setTimeout(() => {
        showProgress.value = false
        progress.value = 0
      }, 500)
    }
  }, 100)
  
  // 触发上传事件
  setTimeout(() => {
    clearInterval(interval)
    showProgress.value = false
    progress.value = 0
    
    // 传递文件到父组件处理
    if (files) {
      setTimeout(() => {
        // 发送上传事件
        if (files) {
          // 使用defineEmits返回的函数而不是直接使用emit
          $emit('upload', files)
        }
      }, 500)
    }
  }, 2000)
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
  width: 500px;
  max-width: 90%;
  position: relative;
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

.upload-progress {
  margin-top: 20px;
}

.progress-bar {
  height: 8px;
  background-color: #eee;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 5px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s;
}
</style>
