<template>
  <div class="text-preview-container">
    <div class="text-preview-header">
      <h2>{{ fileName }}</h2>
      <div class="header-actions">
        <button class="btn-secondary" @click="downloadFile">下载文件</button>
        <button class="btn-secondary" @click="goBack">返回</button>
      </div>
    </div>
    
    <div class="text-preview-content" v-if="!loading">
      <pre v-if="fileContent">{{ fileContent }}</pre>
      <div v-else class="no-content">无法预览此文件内容</div>
    </div>
    
    <div class="loading-container" v-else>
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import config from '@/config'

const route = useRoute()
const router = useRouter()

const fileId = ref(route.params.fileId as string)
const fileName = ref('')
const fileContent = ref('')
const loading = ref(true)

// 加载文件内容
const loadFileContent = async () => {
  try {
    const response = await fetch(`${config.apiBaseUrl}/files/${fileId.value}`, {
      method: 'GET',
      credentials: 'include'
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.code === 20000 && result.data) {
        fileName.value = result.data.name
        
        // 获取文件内容
        const contentResponse = await fetch(result.data.url, {
          method: 'GET'
        })
        
        if (contentResponse.ok) {
          fileContent.value = await contentResponse.text()
        }
      }
    }
  } catch (error) {
    console.error('加载文件内容失败:', error)
  } finally {
    loading.value = false
  }
}

// 下载文件
const downloadFile = () => {
  const downloadUrl = `${config.apiBaseUrl}/files/${fileId.value}/download`
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = fileName.value
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 返回上一页
const goBack = () => {
  router.back()
}

onMounted(() => {
  loadFileContent()
})
</script>

<style scoped>
.text-preview-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Arial', sans-serif;
}

.text-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #eee;
}

.text-preview-header h2 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn-secondary {
  background: #f8f9fa;
  border: 1px solid #ddd;
  color: #333;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: #e9ecef;
  border-color: #adb5bd;
}

.text-preview-content {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  min-height: 400px;
  max-height: 600px;
  overflow: auto;
}

.text-preview-content pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.no-content {
  text-align: center;
  color: #888;
  font-style: italic;
  padding: 40px;
}

.loading-container {
  text-align: center;
  padding: 40px;
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
</style>
