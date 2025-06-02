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
            :class="{ 'folder-name': file.type === 'folder' }"
            @click="file.type === 'folder' ? $emit('navigate', file) : null"
          >
            {{ file.name }}
          </span>
        </div>
        <div class="file-size">{{ formatFileSize(file.size) }}</div>
        <div class="file-date">{{ formatDate(file.updateTime) }}</div>
        <div class="file-actions">
          <button 
            v-if="file.type !== 'folder'" 
            class="action-btn" 
            @click="$emit('download', file)"
          >
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

const props = defineProps({
  files: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

// 定义事件
defineEmits(['navigate', 'download', 'delete', 'rename'])

const selectedFiles = ref<Array<string | number>>([])

// 格式化文件大小
const formatFileSize = (bytes: number) => {
  if (bytes === undefined || bytes === null) return '-'
  if (bytes === 0) return '0 B'
  
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
</style>
