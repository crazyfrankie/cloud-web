<template>
  <div v-if="queueStatus.totalFiles > 0" class="download-queue-manager">
    <div class="queue-header">
      <div class="queue-title">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>下载队列 ({{ queueStatus.totalFiles }})</span>
      </div>
      
      <div class="queue-controls">
        <div class="concurrent-control">
          <label>并发数:</label>
          <select v-model="maxConcurrent" @change="updateConcurrency">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>
        
        <button @click="clearCompleted" class="btn-clear" title="清空已完成">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="3,6 5,6 21,6" />
            <path d="M19,6v14a2,2 0,0 1,-2,2H7a2,2 0,0 1,-2,-2V6m3,0V4a2,2 0,0 1,2,-2h4a2,2 0,0 1,2,2v2" />
          </svg>
        </button>
        
        <button @click="clearAll" class="btn-clear-all" title="清空所有">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        
        <button @click="toggleMinimize" class="btn-toggle">
          <svg v-if="!isMinimized" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="6,9 12,15 18,9" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="18,15 12,9 6,15" />
          </svg>
        </button>
      </div>
    </div>
    
    <div v-if="!isMinimized" class="queue-content">
      <!-- 总体进度 -->
      <div class="overall-progress">
        <div class="progress-info">
          <span>总进度: {{ queueStatus.overallProgress.toFixed(1) }}%</span>
          <span>活跃: {{ queueStatus.activeDownloads }}/{{ queueStatus.maxConcurrentDownloads }}</span>
          <span>已完成: {{ queueStatus.completedFiles }}</span>
          <span>失败: {{ queueStatus.failedFiles }}</span>
        </div>
        <div class="progress-bar-container">
          <div 
            class="progress-bar overall" 
            :style="{ width: queueStatus.overallProgress + '%' }"
          ></div>
        </div>
        <div class="size-info">
          <span>{{ formatFileSize(queueStatus.downloadedSize) }} / {{ formatFileSize(queueStatus.totalSize) }}</span>
        </div>
      </div>
      
      <!-- 队列项列表 -->
      <div class="queue-items">
        <div 
          v-for="item in queueStatus.items" 
          :key="item.id"
          class="queue-item"
          :class="item.status"
        >
          <div class="item-header">
            <div class="file-info">
              <div class="file-name" :title="item.fileName">{{ item.fileName }}</div>
              <div class="file-size">{{ formatFileSize(item.fileSize) }}</div>
            </div>
            <div class="item-actions">
              <button 
                v-if="item.status === 'downloading'" 
                @click="pauseDownload(item.id)"
                class="action-btn pause"
                title="暂停"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>
              
              <button 
                v-if="item.status === 'paused'" 
                @click="resumeDownload(item.id)"
                class="action-btn resume"
                title="继续"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>
              
              <button 
                v-if="item.status === 'failed'" 
                @click="retryDownload(item.id)"
                class="action-btn retry"
                title="重试"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="23,4 23,10 17,10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
              
              <button 
                @click="cancelDownload(item.id)"
                class="action-btn cancel"
                title="取消"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          
          <div class="item-progress">
            <div class="progress-bar-container">
              <div 
                class="progress-bar" 
                :class="item.status"
                :style="{ width: item.progress + '%' }"
              ></div>
            </div>
            <div class="progress-text">{{ item.progress.toFixed(1) }}%</div>
          </div>
          
          <div class="item-stats">
            <div class="status-info">
              <span class="status-badge" :class="item.status">{{ getStatusText(item.status) }}</span>
              <span v-if="item.error" class="error-msg" :title="item.error">{{ item.error }}</span>
            </div>
            
            <div class="download-stats" v-if="item.status === 'downloading'">
              <span class="stats-item speed">
                <AnimatedNumber 
                  :value="item.speed || 0" 
                  :formatter="formatSpeed" 
                  animationType="fast"
                />
              </span>
              <span class="stats-item eta">
                <AnimatedNumber 
                  :value="item.eta || 0" 
                  :formatter="formatTime" 
                  animationType="normal"
                />
              </span>
            </div>
            
            <div class="stats-item bytes">
              <span class="stats-value">{{ formatBytesInfo(item.downloadedBytes, item.fileSize) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 确认对话框 -->
    <div v-if="showConfirmDialog" class="confirm-dialog">
      <div class="dialog-overlay" @click="handleCancel"></div>
      <div class="dialog-content">
        <h3 class="dialog-title">{{ confirmDialogConfig.title }}</h3>
        <p class="dialog-message">{{ confirmDialogConfig.message }}</p>
        <div class="dialog-actions">
          <button @click="handleCancel" class="btn-cancel">
            {{ confirmDialogConfig.cancelText }}
          </button>
          <button @click="handleConfirm" class="btn-confirm" :class="confirmDialogConfig.type">
            {{ confirmDialogConfig.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import FileDownloadService from '@/services/FileDownloadService'
import AnimatedNumber from './AnimatedNumber.vue'

// 组件状态
const isMinimized = ref(false)
const maxConcurrent = ref(3)
const queueStatus = reactive({
  items: [],
  activeDownloads: 0,
  totalFiles: 0,
  completedFiles: 0,
  failedFiles: 0,
  totalSize: 0,
  downloadedSize: 0,
  overallProgress: 0,
  isRunning: false,
  maxConcurrentDownloads: 3
})

// 队列状态监听器
const queueListener = (status: any) => {
  Object.assign(queueStatus, status)
}

// 组件挂载时添加监听器
onMounted(() => {
  FileDownloadService.addQueueListener(queueListener)
  // 初始化状态
  Object.assign(queueStatus, FileDownloadService.getQueueStatus())
  maxConcurrent.value = queueStatus.maxConcurrentDownloads
})

// 组件卸载时移除监听器
onUnmounted(() => {
  FileDownloadService.removeQueueListener(queueListener)
})

// 切换最小化
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

// 更新并发数
const updateConcurrency = () => {
  FileDownloadService.setMaxConcurrentDownloads(maxConcurrent.value)
}

// 暂停下载
const pauseDownload = (id: string) => {
  FileDownloadService.pauseDownload(id)
}

// 继续下载
const resumeDownload = (id: string) => {
  FileDownloadService.resumeQueueDownload(id)
}

// 重试下载
const retryDownload = (id: string) => {
  FileDownloadService.retryDownload(id)
}

// 取消下载
const cancelDownload = (id: string) => {
  FileDownloadService.cancelDownload(id)
}

// 清空已完成
const clearCompleted = () => {
  FileDownloadService.clearCompletedDownloads()
}

// 清空所有
const clearAll = () => {
  showConfirmDialog.value = true
  confirmDialogConfig.value = {
    title: '确认清空',
    message: '确定要清空所有下载项目吗？正在进行的下载将被取消。',
    confirmText: '确定清空',
    cancelText: '取消',
    type: 'danger'
  }
}

// 确认对话框状态
const showConfirmDialog = ref(false)
const confirmDialogConfig = ref({
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  type: 'default'
})

// 处理确认对话框确认
const handleConfirm = () => {
  showConfirmDialog.value = false
  FileDownloadService.clearAllDownloads()
}

// 处理确认对话框取消
const handleCancel = () => {
  showConfirmDialog.value = false
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  return FileDownloadService.formatFileSize(bytes)
}

// 格式化速度
const formatSpeed = (bytesPerSecond: number): string => {
  const speed = formatFileSize(bytesPerSecond)
  return speed + '/s'
}

// 格式化时间
const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  return `${Math.round(seconds / 3600)}小时`
}

// 格式化字节信息
const formatBytesInfo = (downloaded: number, total: number): string => {
  return `${formatFileSize(downloaded)} / ${formatFileSize(total)}`
}

// 获取状态文本
const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    waiting: '等待中',
    downloading: '下载中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停'
  }
  return statusMap[status] || status
}
</script>

<style scoped>
.download-queue-manager {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 500px;
  max-height: 70vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border: 1px solid #e5e7eb;
  z-index: 1000;
  overflow: hidden;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.queue-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 16px;
}

.queue-title .icon {
  width: 20px;
  height: 20px;
}

.queue-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.concurrent-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.concurrent-control select {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
}

.concurrent-control select option {
  background: #4f46e5;
  color: white;
}

.btn-clear,
.btn-clear-all,
.btn-toggle {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-clear:hover,
.btn-clear-all:hover,
.btn-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-clear svg,
.btn-clear-all svg,
.btn-toggle svg {
  width: 16px;
  height: 16px;
}

.queue-content {
  max-height: 60vh;
  overflow-y: auto;
}

.overall-progress {
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: #64748b;
}

.progress-bar-container {
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar.overall {
  background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%);
}

.size-info {
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

.queue-items {
  padding: 8px;
}

.queue-item {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
  padding: 12px;
  transition: all 0.2s;
}

.queue-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.queue-item.downloading {
  border-left: 4px solid #3b82f6;
}

.queue-item.completed {
  border-left: 4px solid #10b981;
  background: #f0fdf4;
}

.queue-item.failed {
  border-left: 4px solid #ef4444;
  background: #fef2f2;
}

.queue-item.paused {
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
}

.queue-item.waiting {
  border-left: 4px solid #6b7280;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: #6b7280;
}

.item-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.action-btn {
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f3f4f6;
}

.action-btn svg {
  width: 12px;
  height: 12px;
}

.action-btn.pause {
  color: #f59e0b;
  border-color: #f59e0b;
}

.action-btn.resume {
  color: #10b981;
  border-color: #10b981;
}

.action-btn.retry {
  color: #3b82f6;
  border-color: #3b82f6;
}

.action-btn.cancel {
  color: #ef4444;
  border-color: #ef4444;
}

.item-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.item-progress .progress-bar-container {
  flex: 1;
  height: 6px;
  margin-bottom: 0;
}

.progress-bar.downloading {
  background: #3b82f6;
}

.progress-bar.completed {
  background: #10b981;
}

.progress-bar.failed {
  background: #ef4444;
}

.progress-bar.paused {
  background: #f59e0b;
}

.progress-bar.waiting {
  background: #6b7280;
}

.progress-text {
  font-size: 12px;
  color: #6b7280;
  min-width: 40px;
  text-align: right;
}

.item-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.downloading {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge.completed {
  background: #dcfce7;
  color: #166534;
}

.status-badge.failed {
  background: #fecaca;
  color: #dc2626;
}

.status-badge.paused {
  background: #fef3c7;
  color: #d97706;
}

.status-badge.waiting {
  background: #f3f4f6;
  color: #4b5563;
}

.error-msg {
  color: #ef4444;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-stats {
  display: flex;
  gap: 8px;
  color: #6b7280;
}

.bytes-info {
  color: #6b7280;
}

/* 滚动条样式 */
.queue-content::-webkit-scrollbar {
  width: 6px;
}

.queue-content::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.queue-content::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.queue-content::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.confirm-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
}

.dialog-content {
  position: relative;
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.dialog-message {
  margin: 12px 0;
  font-size: 14px;
  color: #374151;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  background: #f3f4f6;
  color: #111827;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-cancel:hover {
  background: #e5e7eb;
}

.btn-confirm {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.btn-confirm:hover {
  background: #2563eb;
}

.btn-confirm.danger {
  background: #ef4444;
}

.btn-confirm.danger:hover {
  background: #dc2626;
}

/* 统计项样式 - 解决数字抖动问题 */
.stats-item {
  display: inline-flex;
  align-items: center;
  min-height: 16px;
}

.stats-item.speed {
  min-width: 90px;
}

.stats-item.eta {
  min-width: 60px;
}

.stats-item.bytes {
  min-width: 160px;
  justify-content: flex-end;
}

.stats-value {
  display: inline-block;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 使用 CSS transforms 来避免重绘 */
  transform: translateZ(0);
  will-change: contents;
}

/* 专门为速度和时间使用等宽数字 */
.stats-item.speed .stats-value,
.stats-item.eta .stats-value {
  font-family: ui-monospace, 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Courier New', monospace;
  font-weight: 400;
}

/* 字节信息使用普通字体但保持数字等宽 */
.stats-item.bytes .stats-value {
  font-family: inherit;
  font-variant-numeric: tabular-nums;
}
</style>