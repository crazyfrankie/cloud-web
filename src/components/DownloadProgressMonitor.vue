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
        :data-file-size="getFileSizeCategory(download.totalSize)"
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
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
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
  
  // 对于小文件，不需要重新设置全局定时器，避免干扰其他下载
  const isSmallFile = totalSize < 10 * 1024 * 1024
  if (!isSmallFile) {
    // 只有大文件才重新设置定时器
    resetProgressTimer()
  }
  
  // 开始下载
  // 启动并发下载（不等待完成）
  startDownloadById(downloadId).catch(error => {
    updateDownloadStatus(downloadId, 'error', String(error))
  })

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
  
  // 对于小文件，不需要重新设置全局定时器，避免干扰其他下载
  const isSmallFile = downloadInfo.size < 10 * 1024 * 1024
  if (!isSmallFile) {
    // 只有大文件才重新设置定时器
    resetProgressTimer()
  }
  
  // 开始下载
  startDownloadById(downloadInfo.id).catch(error => {
    updateDownloadStatus(downloadInfo.id, 'error', String(error))
  })
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

    // 根据文件大小调整读取策略
    const isSmallFile = download.totalSize < 10 * 1024 * 1024 // 10MB以下
    const isVerySmallFile = download.totalSize < 1024 * 1024 // 1MB以下
    const isTinyFile = download.totalSize < 100 * 1024 // 100KB以下
    
    // 小文件使用更频繁的进度更新，几乎实时
    let progressUpdateCounter = 0
    let progressUpdateFrequency = 5 // 默认每5次读取更新一次进度
    
    if (isTinyFile) {
      progressUpdateFrequency = 1 // 微型文件每次读取都更新进度
    } else if (isVerySmallFile) {
      progressUpdateFrequency = 1 // 极小文件也是每次都更新
    } else if (isSmallFile) {
      progressUpdateFrequency = 2 // 小文件每2次读取更新一次
    }

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      chunks.push(value)
      receivedLength += value.length
      progressUpdateCounter++

      // 根据文件大小调整进度更新频率
      if (progressUpdateCounter >= progressUpdateFrequency) {
        updateDownloadProgress(downloadId, receivedLength)
        progressUpdateCounter = 0
      }

      // 如果下载被暂停或取消，停止读取
      const currentDownload = activeDownloads.find(d => d.id === downloadId)
      if (currentDownload && (currentDownload.status === 'paused' || currentDownload.status === 'cancelled')) {
        reader.cancel()
        break
      }
    }

    // 确保最终进度更新
    updateDownloadProgress(downloadId, receivedLength)

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

      // 对于小文件，在状态更新前先强制设置100%进度，确保UI立即显示完成状态
      const isSmallFile = download.totalSize < 10 * 1024 * 1024
      if (isSmallFile) {
        download.progress = 100
        download.downloaded = download.totalSize
        // 强制触发响应式更新
        nextTick(() => {
          updateDownloadStatus(downloadId, 'completed')
        })
      } else {
        updateDownloadStatus(downloadId, 'completed')
      }
    }

  } catch (error) {
    updateDownloadStatus(downloadId, 'error', String(error))
  }
}

// 更新下载进度 - 多文件并发优化版本，解决第二个文件延迟问题
const updateDownloadProgress = (downloadId: string, downloaded: number) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (!download) return

  const now = Date.now()
  const elapsed = (now - download.startTime) / 1000
  
  // 根据文件大小判定处理策略
  const isSmallFile = download.totalSize < 10 * 1024 * 1024 // 10MB以下为小文件
  const isVerySmallFile = download.totalSize < 1024 * 1024 // 1MB以下为极小文件
  const isTinyFile = download.totalSize < 100 * 1024 // 100KB以下为微型文件
  
  // 为每个下载独立管理防抖，避免多文件之间的相互干扰
  if (!download.lastProgressUpdate) {
    download.lastProgressUpdate = now
  }
  
  // 针对小文件的独立防抖策略：几乎不防抖
  let debounceMs = 800 // 默认防抖时间（大文件）
  if (isTinyFile) {
    debounceMs = 0 // 微型文件无防抖，完全实时
  } else if (isVerySmallFile) {
    debounceMs = 50 // 极小文件最小防抖
  } else if (isSmallFile) {
    debounceMs = 100 // 小文件极小防抖
  }
  
  const timeSinceLastUpdate = now - download.lastProgressUpdate
  
  // 小文件：强制更新策略，无视防抖限制
  const shouldForceUpdate = isSmallFile && (
    timeSinceLastUpdate >= debounceMs || 
    !download.progress || 
    download.progress === 0
  )
  
  if (!shouldForceUpdate && timeSinceLastUpdate < debounceMs) {
    // 仅更新原始数据，但不跳过小文件的重要更新
    download.downloaded = downloaded
    if (isSmallFile) {
      // 小文件即使在防抖期内也要更新关键数据
      const rawProgress = (downloaded / download.totalSize) * 100
      if (rawProgress > (download.progress || 0) + 5) { // 进度变化超过5%就强制更新
        download.progress = Math.round(rawProgress)
        download.lastProgressUpdate = now
      }
    }
    return
  }
  
  // 更新最后更新时间
  download.lastProgressUpdate = now
  
  // 计算进度，小文件使用更直接的策略
  const rawProgress = (downloaded / download.totalSize) * 100
  const oldProgress = download.progress || 0
  const progressDiff = Math.abs(rawProgress - oldProgress)
  
  // 小文件几乎无阈值限制
  let progressThreshold = 0.5
  if (isTinyFile) {
    progressThreshold = 0 // 微型文件无阈值
  } else if (isVerySmallFile) {
    progressThreshold = 0.01 // 极小文件几乎无阈值
  } else if (isSmallFile) {
    progressThreshold = 0.05 // 小文件极低阈值
  }
  
  // 小文件允许任何进度变化
  if (progressDiff < progressThreshold && rawProgress < 99 && !isSmallFile) {
    download.downloaded = downloaded
    return
  }
  
  // 小文件使用更直接的进度更新策略
  let smoothedProgress = rawProgress
  if (isTinyFile) {
    // 微型文件：完全无平滑，直接使用真实进度
    smoothedProgress = rawProgress
  } else if (isVerySmallFile) {
    // 极小文件：最小平滑，允许大幅跳跃
    if (progressDiff > 30) {
      smoothedProgress = oldProgress + Math.min(progressDiff / 1.1, 35) // 最多跳跃35%
    } else {
      smoothedProgress = rawProgress
    }
  } else if (isSmallFile) {
    // 小文件：轻微平滑
    if (progressDiff > 15) {
      smoothedProgress = oldProgress + Math.min(progressDiff / 1.2, 20) // 最多跳跃20%
    } else {
      smoothedProgress = rawProgress
    }
  } else {
    // 大文件：保持原有的保守平滑策略
    if (progressDiff > 0.8) {
      const maxStep = Math.min(progressDiff / 3, 1)
      if (rawProgress > oldProgress) {
        smoothedProgress = oldProgress + maxStep
      } else {
        smoothedProgress = Math.max(oldProgress - 0.5, rawProgress)
      }
    }
  }
  
  // 根据文件大小调整精度
  if (isTinyFile) {
    download.progress = Math.round(smoothedProgress) // 整数精度，最直接
  } else if (isVerySmallFile) {
    download.progress = Math.round(smoothedProgress) // 整数精度
  } else if (isSmallFile) {
    download.progress = Math.round(smoothedProgress * 2) / 2 // 0.5%精度
  } else {
    download.progress = Math.round(smoothedProgress * 4) / 4 // 0.25%精度
  }
  
  download.downloaded = downloaded

  // 小文件使用更积极的速度计算
  const minElapsedForSpeed = isTinyFile ? 0.3 : (isVerySmallFile ? 0.5 : (isSmallFile ? 1.0 : 3))
  if (elapsed > minElapsedForSpeed) {
    const currentSpeed = downloaded / elapsed
    
    if (download.speed > 0) {
      // 小文件使用更快的速度更新权重
      let alpha = 0.15 // 默认权重
      if (isTinyFile) {
        alpha = 0.8 // 微型文件使用很高的权重，几乎实时
      } else if (isVerySmallFile) {
        alpha = 0.6 // 极小文件使用高权重
      } else if (isSmallFile) {
        alpha = 0.4 // 小文件使用中高权重
      }
      download.speed = download.speed * (1 - alpha) + currentSpeed * alpha
    } else {
      download.speed = currentSpeed
    }
  }

  // 小文件使用更积极的ETA计算
  const minSpeedForEta = isTinyFile ? 128 : (isVerySmallFile ? 256 : (isSmallFile ? 512 : 2048))
  if (download.speed > minSpeedForEta) {
    const remaining = download.totalSize - downloaded
    const newEta = remaining / download.speed
    
    if (download.eta > 0) {
      // 小文件使用更快的ETA更新权重
      let etaAlpha = 0.1 // 默认权重
      if (isTinyFile) {
        etaAlpha = 0.7 // 微型文件使用很高权重，几乎实时
      } else if (isVerySmallFile) {
        etaAlpha = 0.5 // 极小文件使用高权重
      } else if (isSmallFile) {
        etaAlpha = 0.3 // 小文件使用中等权重
      }
      download.eta = download.eta * (1 - etaAlpha) + newEta * etaAlpha
    } else {
      download.eta = newEta
    }
  }
  
  // 为小文件添加强制UI更新机制
  if (isSmallFile) {
    // 触发响应式更新，确保UI立即反映变化
    const index = activeDownloads.findIndex(d => d.id === downloadId)
    if (index !== -1) {
      // 通过数组操作触发响应式更新
      const updatedDownload = { ...activeDownloads[index] }
      activeDownloads.splice(index, 1, updatedDownload)
    }
  }
}

// 更新下载状态 - 多文件并发优化版本
const updateDownloadStatus = (downloadId: string, status: DownloadStatus, error?: string) => {
  const download = activeDownloads.find(d => d.id === downloadId)
  if (!download) return

  const oldStatus = download.status
  download.status = status
  if (error) {
    download.error = error
  }

  // 如果状态发生变化，智能化重新设置定时器
  if (oldStatus !== status) {
    // 对于小文件，避免重置全局定时器，让它们使用独立的进度更新
    const isSmallFile = download.totalSize < 10 * 1024 * 1024
    
    if (!isSmallFile) {
      // 只有大文件状态变化时才重置全局定时器
      resetProgressTimer()
    } else {
      // 小文件状态变化时，仅检查是否所有下载都已完成
      const activeDownloadingCount = activeDownloads.filter(d => d.status === 'downloading').length
      if (activeDownloadingCount === 0) {
        // 如果没有任何活跃下载了，才重置定时器
        resetProgressTimer()
      }
      // 否则不干扰其他正在进行的下载
    }
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

// 移除下载任务 - 多文件并发优化版本
const removeDownload = (downloadId: string) => {
  const index = activeDownloads.findIndex(d => d.id === downloadId)
  if (index !== -1) {
    const removedDownload = activeDownloads[index]
    activeDownloads.splice(index, 1)
    
    // 智能化定时器管理：只在必要时重置
    const remainingDownloadingCount = activeDownloads.filter(d => d.status === 'downloading').length
    
    if (remainingDownloadingCount === 0) {
      // 如果没有正在下载的任务了，重置定时器以停止更新
      resetProgressTimer()
    } else {
      // 如果还有其他下载在进行中，特别是小文件，不要干扰它们
      const isRemovedSmallFile = removedDownload.totalSize < 10 * 1024 * 1024
      const hasLargeFileDownloading = activeDownloads.some(d => 
        d.status === 'downloading' && d.totalSize >= 10 * 1024 * 1024
      )
      
      // 只有在移除的是大文件或者还有大文件在下载时才重置定时器
      if (!isRemovedSmallFile || hasLargeFileDownloading) {
        resetProgressTimer()
      }
      // 如果移除的是小文件且剩下的都是小文件，不重置定时器，让小文件继续使用独立更新
    }
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

// 计算属性：针对小文件优化的稳定显示 - 解决快速下载的显示问题
const stableDownloads = computed(() => {
  return activeDownloads.map(download => {
    // 使用缓存机制避免重复计算
    const cacheKey = `${download.id}_${download.progress}_${download.speed}_${download.eta}`
    if ((download as any)._lastCacheKey === cacheKey) {
      return (download as any)._cachedDisplay
    }
    
    // 判断文件大小类型
    const isSmallFile = download.totalSize < 10 * 1024 * 1024 // 10MB以下
    const isVerySmallFile = download.totalSize < 1024 * 1024 // 1MB以下
    const isTinyFile = download.totalSize < 100 * 1024 // 100KB以下
    
    // 根据文件大小调整进度显示策略
    let displayProgress = Math.round(download.progress || 0)
    
    // 针对小文件的进度显示优化
    const lastDisplayProgress = (download as any)._lastDisplayProgress || 0
    if (download.status === 'downloading') {
      if (displayProgress < lastDisplayProgress) {
        displayProgress = lastDisplayProgress // 防止进度倒退
      } else if (isTinyFile) {
        // 微型文件：直接显示真实进度，无限制
        displayProgress = Math.round(download.progress || 0)
      } else if (isVerySmallFile) {
        // 极小文件：允许很大的进度跳跃
        if (displayProgress > lastDisplayProgress + 50) {
          displayProgress = lastDisplayProgress + 25 // 最多一次跳跃25%
        }
      } else if (isSmallFile) {
        // 小文件：允许较大的进度跳跃
        if (displayProgress > lastDisplayProgress + 20) {
          displayProgress = lastDisplayProgress + 10 // 最多一次跳跃10%
        }
      } else {
        // 大文件：保持原有的保守策略
        if (displayProgress > lastDisplayProgress + 2) {
          displayProgress = lastDisplayProgress + 1
        }
      }
    }
    (download as any)._lastDisplayProgress = displayProgress
    
    // 根据文件大小调整速度显示策略
    let displaySpeed = ''
    const speedThreshold = isVerySmallFile ? 512 : (isSmallFile ? 1024 : 2048)
    
    if (download.speed > speedThreshold) {
      const speedKB = download.speed / 1024
      if (speedKB < 1024) {
        // KB/s 显示
        if (isVerySmallFile) {
          // 极小文件：更频繁的速度更新，较小的四舍五入
          const roundedSpeedKB = Math.round(speedKB / 2) * 2 // 四舍五入到2的倍数
          displaySpeed = roundedSpeedKB + ' KB/s'
        } else if (isSmallFile) {
          // 小文件：适度的四舍五入
          const roundedSpeedKB = Math.round(speedKB / 3) * 3 // 四舍五入到3的倍数
          displaySpeed = roundedSpeedKB + ' KB/s'
        } else {
          // 大文件：保持原有策略
          const roundedSpeedKB = Math.round(speedKB / 5) * 5 // 四舍五入到5的倍数
          displaySpeed = roundedSpeedKB + ' KB/s'
        }
      } else {
        // MB/s 显示
        const speedMB = speedKB / 1024
        if (speedMB >= 50) {
          const roundFactor = isSmallFile ? 2 : 5
          displaySpeed = Math.round(speedMB / roundFactor) * roundFactor + ' MB/s'
        } else if (speedMB >= 10) {
          displaySpeed = Math.round(speedMB) + ' MB/s'
        } else {
          const precision = isVerySmallFile ? 2 : 1
          displaySpeed = speedMB.toFixed(precision) + ' MB/s'
        }
      }
    }
    
    // 根据文件大小调整ETA显示策略
    let displayEta = ''
    const etaThreshold = isVerySmallFile ? 512 : (isSmallFile ? 1024 : 2048)
    
    if (download.eta > 0 && download.speed > etaThreshold) {
      if (download.eta < 5) {
        displayEta = '即将完成'
      } else if (download.eta < 30) {
        // 小文件：显示更精确的秒数
        if (isVerySmallFile) {
          displayEta = Math.round(download.eta / 2) * 2 + '秒' // 四舍五入到2秒
        } else if (isSmallFile) {
          displayEta = Math.round(download.eta / 5) * 5 + '秒' // 四舍五入到5秒
        } else {
          displayEta = Math.round(download.eta / 10) * 10 + '秒' // 四舍五入到10秒
        }
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

// 获取文件大小类别（用于CSS类）
const getFileSizeCategory = (totalSize: number): string => {
  if (totalSize < 100 * 1024) return 'tiny' // 100KB以下为微型
  if (totalSize < 1024 * 1024) return 'very-small' // 1MB以下为极小
  if (totalSize < 10 * 1024 * 1024) return 'small' // 10MB以下为小
  return 'large' // 10MB以上为大
}

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
  /* 根据文件大小动态调整过渡时间 */
  /* 小文件使用更快的过渡，大文件使用更慢的过渡 */
  transition: width 0.8s ease-out;
  /* 开启硬件加速，减少浏览器重绘开销 */
  transform: translateZ(0);
  will-change: width;
}

/* 为不同大小的文件提供不同的过渡速度 */
.download-item[data-file-size="tiny"] .progress-bar {
  transition: width 0.1s ease-out; /* 微型文件：100ms过渡，几乎实时 */
}

.download-item[data-file-size="very-small"] .progress-bar {
  transition: width 0.2s ease-out; /* 极小文件：200ms过渡 */
}

.download-item[data-file-size="small"] .progress-bar {
  transition: width 0.4s ease-out; /* 小文件：400ms过渡 */
}

.download-item[data-file-size="large"] .progress-bar {
  transition: width 1.2s linear; /* 大文件：1.2s线性过渡 */
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
