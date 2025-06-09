<template>
  <div v-if="activeDownloads.length > 0" class="download-progress-monitor">
    <div class="monitor-header">
      <h3>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        下载进度 ({{ activeDownloads.length }})
      </h3>
      <button @click="toggleMinimize" class="minimize-btn">
        <svg v-if="!isMinimized" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="6,9 12,15 18,9" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="18,15 12,9 6,15" />
        </svg>
      </button>
    </div>

    <div v-if="!isMinimized" class="monitor-content">
      <div 
        v-for="download in stableDownloads" 
        :key="download.id" 
        class="download-item"
        :class="{ 'error': download.status === 'error', 'completed': download.status === 'completed' }"
      >
        <div class="download-info">
          <div class="file-name">{{ download.fileName }}</div>
          <div class="file-size">{{ formatFileSize(download.totalSize) }}</div>
        </div>

        <div class="progress-section">
          <div class="progress-bar-container">
            <div 
              class="progress-bar" 
              :class="download.status"
              :style="{ width: download.displayProgress + '%' }"
            ></div>
          </div>
          <div class="progress-text">{{ download.displayProgress }}%</div>
        </div>

        <div class="download-stats">
          <div class="speed" v-if="download.displaySpeed">
            {{ download.displaySpeed }}
          </div>
          <div class="eta" v-if="download.displayEta">
            剩余: {{ download.displayEta }}
          </div>
          <div class="downloaded">
            {{ download.displayDownloaded }} / {{ download.displayTotalSize }}
          </div>
        </div>

        <div class="download-actions">
          <button 
            v-if="download.status === 'downloading'" 
            @click="pauseDownload(download.id)"
            class="action-btn pause-btn"
            title="暂停下载"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </button>

          <button 
            v-if="download.status === 'paused'" 
            @click="resumeDownload(download.id)"
            class="action-btn resume-btn"
            title="继续下载"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>

          <button 
            v-if="download.status === 'error'" 
            @click="retryDownload(download.id)"
            class="action-btn retry-btn"
            title="重试下载"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="23,4 23,10 17,10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>

          <button 
            @click="cancelDownload(download.id)"
            class="action-btn cancel-btn"
            title="取消下载"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import FileDownloadService from '@/services/FileDownloadService'

// 下载状态类型
type DownloadStatus = 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'

// 下载项接口
interface DownloadItem {
  id: string
  fileId: number
  fileName: string
  totalSize: number
  downloaded: number
  progress: number
  speed: number // bytes per second
  eta: number // seconds
  status: DownloadStatus
  startTime: number
  lastProgressUpdate?: number // 最后更新进度的时间戳，用于防抖
  error?: string
}

// 组件状态
const isMinimized = ref(false)
const activeDownloads = reactive<DownloadItem[]>([])
const downloadService = FileDownloadService
const progressUpdateInterval = ref<number | null>(null)

// 切换最小化状态
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化下载速度
const formatSpeed = (bytesPerSecond: number): string => {
  const speed = formatFileSize(bytesPerSecond)
  return speed + '/s'
}

// 格式化显示速度，减少数字跳动
const formatSpeedStable = (bytesPerSecond: number): string => {
  if (bytesPerSecond < 1024) return '< 1 KB/s' // 避免显示很小的速度
  
  const speed = formatFileSize(bytesPerSecond)
  // 移除过多的小数位，保持显示稳定
  const parts = speed.split(' ')
  if (parts.length === 2) {
    const value = parseFloat(parts[0])
    const unit = parts[1]
    if (value >= 100) {
      return Math.round(value) + ' ' + unit + '/s'
    } else if (value >= 10) {
      return value.toFixed(1) + ' ' + unit + '/s'
    } else {
      return value.toFixed(2) + ' ' + unit + '/s'
    }
  }
  return speed + '/s'
}

// 格式化时间
const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  return `${Math.round(seconds / 3600)}小时`
}

// 格式化ETA时间，避免频繁变化
const formatTimeStable = (seconds: number): string => {
  if (seconds < 5) return '即将完成'
  if (seconds < 60) return `${Math.round(seconds / 5) * 5}秒` // 四舍五入到5秒
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  return `${Math.round(seconds / 3600)}小时`
}

// 添加下载任务
const addDownload = async (fileId: number, fileName: string, totalSize: number): Promise<string> => {
  const downloadId = `download_${fileId}_${Date.now()}`
  
  const downloadItem: DownloadItem = {
    id: downloadId,
    fileId,
    fileName,
    totalSize,
    downloaded: 0,
    progress: 0,
    speed: 0,
    eta: 0,
    status: 'downloading',
    startTime: Date.now()
  }

  activeDownloads.push(downloadItem)
  
  // 重新设置定时器以适应新的下载数量
  resetProgressTimer()
  
  // 开始下载
  try {
    await startDownloadById(downloadId)
  } catch (error) {
    updateDownloadStatus(downloadId, 'error', String(error))
  }

  return downloadId
}

// 启动监控下载 - 兼容DashboardView接口
const startDownload = async (downloadInfo: {
  id: string;
  filename: string;
  url: string;
  size: number;
  fileInfo: any;
}): Promise<void> => {
  const downloadItem: DownloadItem = {
    id: downloadInfo.id,
    fileId: downloadInfo.fileInfo.id,
    fileName: downloadInfo.filename,
    totalSize: downloadInfo.size,
    downloaded: 0,
    progress: 0,
    speed: 0,
    eta: 0,
    status: 'downloading',
    startTime: Date.now()
  }

  activeDownloads.push(downloadItem)
  
  // 重新设置定时器以适应新的下载数量
  resetProgressTimer()
  
  // 开始下载
  try {
    await startDownloadById(downloadInfo.id)
  } catch (error) {
    updateDownloadStatus(downloadInfo.id, 'error', String(error))
    throw error
  }
}

// 重命名原始的startDownload方法
const startDownloadById = async (downloadId: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (!download) return

  try {
    // 使用新的下载API
    const response = await downloadService.downloadLargeFile(
      download.fileId,
      download.downloaded // 断点续传的起始位置
    )

    if (!response.body) {
      throw new Error('无法获取响应流')
    }

    // 创建ReadableStream reader
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedLength = download.downloaded

    // 更新下载状态
    download.status = 'downloading'

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      chunks.push(value)
      receivedLength += value.length

      // 更新进度
      updateDownloadProgress(downloadId, receivedLength)

      // 如果下载被暂停或取消，停止读取
      const currentDownload = activeDownloads.find(d => d.id === downloadId)
      if (currentDownload && (currentDownload.status === 'paused' || currentDownload.status === 'cancelled')) {
        reader.cancel()
        break
      }
    }

    // 下载完成，创建文件并下载
    if (download.status === 'downloading') {
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = download.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      updateDownloadStatus(downloadId, 'completed')
    }

  } catch (error) {
    updateDownloadStatus(downloadId, 'error', String(error))
  }
}

// 更新下载进度 - 最终防闪顿优化版本，解决视觉顿挫问题
const updateDownloadProgress = (downloadId: string, downloaded: number) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (!download) return

  const now = Date.now()
  const elapsed = (now - download.startTime) / 1000
  
  // 更严格的防抖控制，减少不必要的响应式更新
  if (!download.lastProgressUpdate) {
    download.lastProgressUpdate = now
  } else if (now - download.lastProgressUpdate < 800) { // 延长到800ms，进一步减少更新频率
    // 仅更新原始数据，不触发响应式计算
    download.downloaded = downloaded
    return
  }
  download.lastProgressUpdate = now
  
  // 计算进度，使用更保守的更新策略
  const rawProgress = (downloaded / download.totalSize) * 100
  const oldProgress = download.progress || 0
  const progressDiff = Math.abs(rawProgress - oldProgress)
  
  // 只有显著变化（>0.5%）时才更新UI
  if (progressDiff < 0.5 && rawProgress < 99) {
    download.downloaded = downloaded // 仅更新数据
    return
  }
  
  // 极其平滑的进度更新，避免任何跳跃
  let smoothedProgress = rawProgress
  if (progressDiff > 0.8) {
    // 更保守的平滑策略：每次最多增加1%
    const maxStep = Math.min(progressDiff / 3, 1)
    if (rawProgress > oldProgress) {
      smoothedProgress = oldProgress + maxStep
    } else {
      smoothedProgress = Math.max(oldProgress - 0.5, rawProgress) // 避免进度倒退
    }
  }
  
  // 限制小数精度，避免微小变化导致的重渲染
  download.progress = Math.round(smoothedProgress * 4) / 4 // 0.25%精度
  download.downloaded = downloaded

  // 更稳定的速度计算
  if (elapsed > 3) { // 延长到3秒确保更稳定的速度计算
    const currentSpeed = downloaded / elapsed
    
    if (download.speed > 0) {
      // 使用更强的平滑权重，减少速度跳动
      const alpha = 0.15 // 进一步降低新数据权重
      download.speed = download.speed * (1 - alpha) + currentSpeed * alpha
    } else {
      download.speed = currentSpeed
    }
  }

  // 更稳定的ETA计算
  if (download.speed > 2048) { // 提高速度阈值到2KB/s
    const remaining = download.totalSize - downloaded
    const newEta = remaining / download.speed
    
    if (download.eta > 0) {
      // 更保守的ETA平滑，减少时间跳动
      const etaAlpha = 0.1
      download.eta = download.eta * (1 - etaAlpha) + newEta * etaAlpha
    } else {
      download.eta = newEta
    }
  }
}

// 更新下载状态
const updateDownloadStatus = (downloadId: string, status: DownloadStatus, error?: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (!download) return

  const oldStatus = download.status
  download.status = status
  if (error) {
    download.error = error
  }

  // 如果状态发生变化，重新设置定时器
  if (oldStatus !== status) {
    resetProgressTimer()
  }

  // 如果下载完成或出错，5秒后自动移除
  if (status === 'completed' || status === 'error') {
    setTimeout(() => {
      removeDownload(downloadId)
    }, 5000)
  }
}

// 暂停下载
const pauseDownload = (downloadId: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (download) {
    download.status = 'paused'
  }
}

// 继续下载
const resumeDownload = async (downloadId: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (download) {
    download.status = 'downloading'
    try {
      await startDownloadById(downloadId)
    } catch (error) {
      updateDownloadStatus(downloadId, 'error', String(error))
    }
  }
}

// 重试下载
const retryDownload = async (downloadId: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (download) {
    download.downloaded = 0
    download.progress = 0
    download.speed = 0
    download.eta = 0
    download.startTime = Date.now()
    download.error = undefined
    download.status = 'downloading'
    
    try {
      await startDownloadById(downloadId)
    } catch (error) {
      updateDownloadStatus(downloadId, 'error', String(error))
    }
  }
}

// 取消下载
const cancelDownload = (downloadId: string) => {
  updateDownloadStatus(downloadId, 'cancelled')
  removeDownload(downloadId)
}

// 移除下载任务
const removeDownload = (downloadId: string) => {
  const index = activeDownloads.findIndex(d => d.id === downloadId)
  if (index !== -1) {
    activeDownloads.splice(index, 1)
    // 下载任务移除后重新设置定时器
    resetProgressTimer()
  }
}

// 定期更新所有下载的进度信息 - 终极优化版本，彻底解决闪顿
const updateAllProgress = async () => {
  const downloadingItems = activeDownloads.filter(d => d.status === 'downloading')
  
  // 如果没有正在下载的项目，暂停更新定时器
  if (downloadingItems.length === 0) {
    if (progressUpdateInterval.value) {
      clearInterval(progressUpdateInterval.value)
      progressUpdateInterval.value = null
    }
    return
  }

  // 智能API调用策略：只在必要时调用API
  const now = Date.now()
  const updatePromises = downloadingItems
    .filter(download => {
      const elapsed = (now - download.startTime) / 1000
      const timeSinceLastUpdate = download.lastProgressUpdate ? 
        (now - download.lastProgressUpdate) / 1000 : 0
      
      // 只有在以下情况才调用API：
      // 1. 下载开始超过10秒且最近没有更新过
      // 2. 或者是大文件（>500MB）且下载时间超过30秒
      const isStaleDownload = elapsed > 10 && timeSinceLastUpdate > 30
      const isLargeFileCheck = download.totalSize > 500 * 1024 * 1024 && elapsed > 30 && timeSinceLastUpdate > 60
      
      return isStaleDownload || isLargeFileCheck
    })
    .map(async (download) => {
      try {
        const progressInfo = await downloadService.getDownloadProgress(download.fileId)
        // 仅在数据真正变化时更新
        if (Math.abs(progressInfo.totalSize - download.totalSize) > 1024) {
          download.totalSize = progressInfo.totalSize
        }
      } catch (error) {
        // 静默处理错误，避免干扰用户体验
        console.debug('进度查询失败:', download.fileName, error)
      }
    })

  // 并发执行，但限制并发数，避免服务器压力
  if (updatePromises.length > 0) {
    await Promise.allSettled(updatePromises)
  }
}

// 动态计算进度更新间隔 - 防闪顿优化版本
const getProgressUpdateInterval = (): number => {
  const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length
  
  // 如果没有活跃下载，使用很长的间隔
  if (downloadingCount === 0) return 60000 // 60秒 - 基本停用定时器
  
  // 检查是否有大文件下载（>100MB）和下载活跃度
  const hasLargeFiles = activeDownloads.some(d => 
    d.status === 'downloading' && d.totalSize > 100 * 1024 * 1024
  )
  
  // 计算平均下载时间，判断下载活跃程度
  const now = Date.now()
  const avgDownloadTime = activeDownloads
    .filter(d => d.status === 'downloading')
    .reduce((sum, d) => sum + (now - d.startTime), 0) / downloadingCount
  
  const isRecentDownload = avgDownloadTime < 10000 // 10秒内的新下载
  
  // 根据多个因素综合决定更新间隔
  if (downloadingCount === 1) {
    if (hasLargeFiles) {
      return isRecentDownload ? 15000 : 25000 // 15秒或25秒
    } else {
      return isRecentDownload ? 10000 : 20000 // 10秒或20秒  
    }
  }
  
  if (downloadingCount <= 3) {
    // 2-3个并发下载，降低频率避免服务器压力
    return hasLargeFiles ? 30000 : 25000 // 25-30秒
  }
  
  // 多个并发下载，大幅降低更新频率
  return 45000 // 45秒 - 减少对服务器和UI的影响
}

// 重新设置定时器 - 智能化定时器管理
const resetProgressTimer = () => {
  // 清理现有定时器
  if (progressUpdateInterval.value) {
    clearInterval(progressUpdateInterval.value)
    progressUpdateInterval.value = null
  }
  
  // 检查是否有活跃下载
  const downloadingCount = activeDownloads.filter(d => d.status === 'downloading').length
  if (downloadingCount === 0) {
    console.log('没有活跃下载，暂停定时器')
    return
  }
  
  const interval = getProgressUpdateInterval()
  
  // 使用setTimeout而不是setInterval，避免重叠执行
  const scheduleNextUpdate = () => {
    const timeoutId = setTimeout(async () => {
      await updateAllProgress()
      // 如果还有活跃下载，安排下次更新
      const currentDownloadingCount = activeDownloads.filter(d => d.status === 'downloading').length
      if (currentDownloadingCount > 0) {
        scheduleNextUpdate()
      }
    }, interval)
    
    progressUpdateInterval.value = timeoutId
  }
  
  scheduleNextUpdate()
  console.log(`设置进度更新间隔: ${interval}ms (活跃下载: ${downloadingCount}个)`)
}

// 组件挂载时启动进度更新定时器
onMounted(() => {
  resetProgressTimer()
})

// 组件卸载时清理所有资源
onUnmounted(() => {
  if (progressUpdateInterval.value) {
    clearTimeout(progressUpdateInterval.value) // 修改为clearTimeout
    progressUpdateInterval.value = null
  }
  
  // 清理所有下载项的缓存数据
  activeDownloads.forEach(download => {
    delete (download as any)._lastDisplayProgress
    delete (download as any)._lastCacheKey
    delete (download as any)._cachedDisplay
  })
})

// 计算属性：超级稳定的下载显示 - 彻底解决闪顿问题
const stableDownloads = computed(() => {
  return activeDownloads.map(download => {
    // 使用缓存机制避免重复计算
    const cacheKey = `${download.id}_${download.progress}_${download.speed}_${download.eta}`
    if ((download as any)._lastCacheKey === cacheKey) {
      return (download as any)._cachedDisplay
    }
    
    // 稳定的进度显示 - 防止任何跳动
    let displayProgress = Math.round(download.progress || 0)
    
    // 严格的进度递增保护
    const lastDisplayProgress = (download as any)._lastDisplayProgress || 0
    if (displayProgress < lastDisplayProgress && download.status === 'downloading') {
      displayProgress = lastDisplayProgress
    } else if (displayProgress > lastDisplayProgress + 2 && download.status === 'downloading') {
      // 防止进度跳跃过大
      displayProgress = lastDisplayProgress + 1
    }
    (download as any)._lastDisplayProgress = displayProgress
    
    // 高度稳定的速度显示 - 减少数字变化
    let displaySpeed = ''
    if (download.speed > 2048) { // 提高显示阈值
      const speedKB = download.speed / 1024
      if (speedKB < 1024) {
        // KB/s 显示，更大幅度的四舍五入
        const roundedSpeedKB = Math.round(speedKB / 5) * 5 // 四舍五入到5的倍数
        displaySpeed = roundedSpeedKB + ' KB/s'
      } else {
        // MB/s 显示，减少精度变化
        const speedMB = speedKB / 1024
        if (speedMB >= 50) {
          displaySpeed = Math.round(speedMB / 5) * 5 + ' MB/s' // 四舍五入到5的倍数
        } else if (speedMB >= 10) {
          displaySpeed = Math.round(speedMB) + ' MB/s' // 整数显示
        } else {
          displaySpeed = speedMB.toFixed(1) + ' MB/s' // 1位小数
        }
      }
    }
    
    // 超级稳定的ETA显示 - 最小化时间跳动
    let displayEta = ''
    if (download.eta > 0 && download.speed > 2048) {
      if (download.eta < 15) {
        displayEta = '即将完成'
      } else if (download.eta < 90) {
        // 四舍五入到15秒的倍数
        displayEta = Math.round(download.eta / 15) * 15 + '秒'
      } else if (download.eta < 3600) {
        // 四舍五入到分钟
        displayEta = Math.round(download.eta / 60) + '分钟'
      } else {
        displayEta = Math.round(download.eta / 3600) + '小时'
      }
    }
    
    // 缓存结果避免重复计算
    const result = {
      ...download,
      displayProgress,
      displaySpeed,
      displayEta,
      displayDownloaded: formatFileSize(download.downloaded || 0),
      displayTotalSize: formatFileSize(download.totalSize || 0)
    }
    
    ;(download as any)._lastCacheKey = cacheKey
    ;(download as any)._cachedDisplay = result
    
    return result
  })
})

// 导出方法供外部组件使用
defineExpose({
  addDownload,
  startDownload,
  removeDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload
})
</script>

<style scoped>
.download-progress-monitor {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 400px;
  max-height: 500px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e0e0e0;
  z-index: 1000;
  overflow: hidden;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.monitor-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.monitor-header .icon {
  width: 16px;
  height: 16px;
}

.minimize-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.minimize-btn:hover {
  background: #e0e0e0;
}

.minimize-btn svg {
  width: 16px;
  height: 16px;
}

.monitor-content {
  max-height: 400px;
  overflow-y: auto;
}

.download-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.download-item:last-child {
  border-bottom: none;
}

.download-item.error {
  background: #fef2f2;
  border-left: 3px solid #ef4444;
}

.download-item.completed {
  background: #f0fdf4;
  border-left: 3px solid #22c55e;
}

.download-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.file-name {
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.file-size {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.progress-bar-container {
  flex: 1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 3px;
  /* 使用线性过渡，避免贝塞尔曲线造成的视觉不适 */
  transition: width 1.2s linear;
  /* 开启硬件加速，减少浏览器重绘开销 */
  transform: translateZ(0);
  will-change: width;
}

.progress-bar.downloading {
  background: #3b82f6;
}

.progress-bar.paused {
  background: #f59e0b;
}

.progress-bar.completed {
  background: #22c55e;
}

.progress-bar.error {
  background: #ef4444;
}

.progress-text {
  font-size: 12px;
  color: #666;
  min-width: 35px;
  text-align: right;
}

.download-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #666;
  margin-bottom: 8px;
}

.download-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.action-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.action-btn:hover {
  background: #f5f5f5;
}

.action-btn svg {
  width: 12px;
  height: 12px;
}

.pause-btn {
  color: #f59e0b;
  border-color: #f59e0b;
}

.resume-btn {
  color: #22c55e;
  border-color: #22c55e;
}

.retry-btn {
  color: #3b82f6;
  border-color: #3b82f6;
}

.cancel-btn {
  color: #ef4444;
  border-color: #ef4444;
}

.action-btn:hover.pause-btn {
  background: #fef3c7;
}

.action-btn:hover.resume-btn {
  background: #dcfce7;
}

.action-btn:hover.retry-btn {
  background: #dbeafe;
}

.action-btn:hover.cancel-btn {
  background: #fef2f2;
}

/* 滚动条样式 */
.monitor-content::-webkit-scrollbar {
  width: 6px;
}

.monitor-content::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.monitor-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.monitor-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
