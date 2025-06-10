// 文件下载服务
import config from '@/config'
import AuthService from './AuthService'

// 下载请求
interface DownloadRequest {
  fileIds: number[]
  zipName?: string
}

// 前端下载队列项
interface DownloadQueueItem {
  id: string
  fileId: number
  fileName: string
  fileSize: number
  status: 'waiting' | 'downloading' | 'completed' | 'failed' | 'paused'
  progress: number
  downloadedBytes: number
  error?: string
  startTime?: number
  endTime?: number
  downloadUrl?: string
  abortController?: AbortController
  speed?: number // 下载速度（字节/秒）
  eta?: number // 预计剩余时间（秒）
  chunks?: Uint8Array[] // 已下载的数据块，用于断点续传
  lastDownloadedPosition?: number // 最后下载的位置，用于断点续传
  // 速度计算相关字段
  speedHistory?: number[] // 速度历史记录
  lastSpeedUpdateTime?: number // 上次速度更新时间
  lastBytesForSpeed?: number // 上次用于计算速度的字节数
}

// 前端队列状态
interface FrontendQueueStatus {
  items: DownloadQueueItem[]
  activeDownloads: number
  totalFiles: number
  completedFiles: number
  failedFiles: number
  totalSize: number
  downloadedSize: number
  overallProgress: number
  isRunning: boolean
  maxConcurrentDownloads: number
}

// 用户配置
interface UserDownloadConfig {
  maxConcurrentDownloads: number
  isVip: boolean
  vipLevel: number
}

// 下载响应
interface DownloadResponse {
  type: 'single' | 'multiple' | 'zip' | 'queue'
  files: DownloadDetail[]
  totalSize: number
  zipName?: string
  dlink?: string
}

// 下载文件详情
interface DownloadDetail {
  id: number
  name: string
  size: number
  dlink?: string
}

// 文件信息（用于文件夹展开）
interface FileInfo {
  id: number
  name: string
  path: string
  isDir: boolean
  size: number
  type: string
}

// 下载进度信息
interface DownloadProgressInfo {
  fileId: number
  fileName: string
  contentType: string
  totalSize: number
  acceptRanges: boolean
  etag: string
  lastModified?: string
}

class FileDownloadService {
  private baseUrl = config.apiBaseUrl
  private downloadQueue: DownloadQueueItem[] = []
  private activeDownloads = 0
  private maxConcurrentDownloads = 3 // 默认普通用户3个并发
  private isProcessingQueue = false
  private queueListeners: Array<(status: FrontendQueueStatus) => void> = []
  private readonly LARGE_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB
  private isUpdatingUI = false // UI更新状态
  private lastNotifyTime?: number // 上次通知时间

  constructor() {
    // 从localStorage恢复用户配置
    this.loadUserConfig()
  }

  /**
   * 加载用户下载配置
   */
  private loadUserConfig(): void {
    try {
      const configStr = localStorage.getItem('downloadConfig')
      if (configStr) {
        const config: UserDownloadConfig = JSON.parse(configStr)
        this.maxConcurrentDownloads = config.maxConcurrentDownloads || 3
      }
    } catch (error) {
      console.warn('加载下载配置失败:', error)
    }
  }

  /**
   * 保存用户下载配置
   */
  private saveUserConfig(config: UserDownloadConfig): void {
    try {
      localStorage.setItem('downloadConfig', JSON.stringify(config))
    } catch (error) {
      console.warn('保存下载配置失败:', error)
    }
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrentDownloads(count: number): void {
    this.maxConcurrentDownloads = Math.max(1, Math.min(10, count))
    this.saveUserConfig({
      maxConcurrentDownloads: this.maxConcurrentDownloads,
      isVip: false,
      vipLevel: 0
    })
    // 重新处理队列
    this.processQueue()
  }

  /**
   * 添加队列状态监听器
   */
  addQueueListener(listener: (status: FrontendQueueStatus) => void): void {
    this.queueListeners.push(listener)
  }

  /**
   * 移除队列状态监听器
   */
  removeQueueListener(listener: (status: FrontendQueueStatus) => void): void {
    const index = this.queueListeners.indexOf(listener)
    if (index > -1) {
      this.queueListeners.splice(index, 1)
    }
  }

  /**
   * 通知队列状态变化（优化版本，减少频繁更新）
   */
  private notifyQueueStatus(): void {
    const status = this.getQueueStatus()
    
    // 使用 requestAnimationFrame 来优化UI更新频率
    if (!this.isUpdatingUI) {
      this.isUpdatingUI = true
      requestAnimationFrame(() => {
        this.queueListeners.forEach(listener => {
          try {
            listener(status)
          } catch (error) {
            console.error('队列状态监听器执行失败:', error)
          }
        })
        this.isUpdatingUI = false
      })
    }
  }

  /**
   * 平滑通知队列状态变化（减少数据跳跃）
   */
  private smoothNotifyQueueStatus(): void {
    // 限制更新频率为每300ms一次，减少突兀感
    if (this.lastNotifyTime && Date.now() - this.lastNotifyTime < 300) {
      return
    }
    
    this.lastNotifyTime = Date.now()
    this.notifyQueueStatus()
  }

  /**
   * 获取当前队列状态
   */
  getQueueStatus(): FrontendQueueStatus {
    const totalSize = this.downloadQueue.reduce((sum, item) => sum + item.fileSize, 0)
    const downloadedSize = this.downloadQueue.reduce((sum, item) => sum + item.downloadedBytes, 0)
    const completedFiles = this.downloadQueue.filter(item => item.status === 'completed').length
    const failedFiles = this.downloadQueue.filter(item => item.status === 'failed').length

    return {
      items: [...this.downloadQueue],
      activeDownloads: this.activeDownloads,
      totalFiles: this.downloadQueue.length,
      completedFiles,
      failedFiles,
      totalSize,
      downloadedSize,
      overallProgress: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
      isRunning: this.isProcessingQueue,
      maxConcurrentDownloads: this.maxConcurrentDownloads
    }
  }

  /**
   * 获取基础URL
   */
  get apiBaseUrl(): string {
    return this.baseUrl
  }

  /**
   * 获取文件夹下的所有文件
   * @param folderId 文件夹ID
   * @returns 文件列表
   */
  async getFolderFiles(folderPath: string): Promise<FileInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/files?path=${encodeURIComponent(folderPath)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AuthService.getAccessToken()}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`获取文件夹内容失败: ${response.statusText}`)
      }

      const result = await response.json()
      return result.data?.contents || []
    } catch (error) {
      console.error('获取文件夹内容失败:', error)
      throw error
    }
  }

  /**
   * 递归获取文件夹下所有文件（不包括子文件夹）
   * @param folderPath 文件夹路径
   * @returns 所有文件的ID列表
   */
  async getFileIdsFromFolder(folderPath: string): Promise<number[]> {
    const fileIds: number[] = []
    const contents = await this.getFolderFiles(folderPath)
    
    for (const item of contents) {
      if (item.isDir) {
        // 递归获取子文件夹的文件
        const subFileIds = await this.getFileIdsFromFolder(item.path)
        fileIds.push(...subFileIds)
      } else {
        // 添加文件ID
        fileIds.push(item.id)
      }
    }
    
    return fileIds
  }

  /**
   * 计算选中项目的总大小和文件数量
   * @param selectedItems 选中的文件/文件夹列表
   * @returns 总大小和文件数量
   */
  async calculateDownloadInfo(selectedItems: FileInfo[]): Promise<{ totalSize: number, fileCount: number, fileIds: number[] }> {
    let totalSize = 0
    let fileCount = 0
    const fileIds: number[] = []

    for (const item of selectedItems) {
      if (item.isDir) {
        // 文件夹：递归计算大小
        const folderFileIds = await this.getFileIdsFromFolder(item.path)
        fileIds.push(...folderFileIds)
        
        // 获取文件详情来计算大小
        const folderFiles = await this.getFileDetails(folderFileIds)
        for (const file of folderFiles) {
          totalSize += file.size
          fileCount++
        }
      } else {
        // 文件：直接添加
        totalSize += item.size
        fileCount++
        fileIds.push(item.id)
      }
    }

    return { totalSize, fileCount, fileIds }
  }

  /**
   * 获取文件详情
   * @param fileIds 文件ID列表
   * @returns 文件详情列表
   */
  async getFileDetails(fileIds: number[]): Promise<FileInfo[]> {
    // 这里可能需要调用具体的API获取文件详情
    // 暂时使用简化版本，实际项目中可能需要批量查询API
    const files: FileInfo[] = []
    
    for (const id of fileIds) {
      try {
        const response = await fetch(`${this.baseUrl}/files/${id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${AuthService.getAccessToken()}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const result = await response.json()
          files.push(result.data)
        }
      } catch (error) {
        console.error(`获取文件${id}详情失败:`, error)
      }
    }
    
    return files
  }

  /**
   * 下载文件
   * @param fileIds 文件ID列表
   * @param zipName ZIP文件名（可选）
   * @returns 下载响应
   */
  async downloadFiles(fileIds: number[], zipName?: string): Promise<DownloadResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/files/download`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AuthService.getAccessToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileIds,
          zipName
        })
      })

      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`)
      }

      // 检查响应类型
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/zip')) {
        // ZIP文件直接下载
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = zipName || 'download.zip'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        
        return {
          type: 'zip',
          files: [],
          totalSize: blob.size
        }
      } else {
        // JSON响应
        const result = await response.json()
        return result.data
      }
    } catch (error) {
      console.error('下载失败:', error)
      throw error
    }
  }

  /**
   * 直接下载单个文件
   * @param downloadUrl 下载链接
   * @param fileName 文件名
   */
  async directDownload(downloadUrl: string, fileName: string): Promise<void> {
    try {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('直接下载失败:', error)
      throw error
    }
  }

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化后的大小字符串
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // ===== 前端队列管理 =====

  /**
   * 添加文件到前端下载队列
   * @param files 文件信息列表
   * @returns 添加的队列项ID列表
   */
  async addFilesToQueue(files: FileInfo[]): Promise<string[]> {
    const addedIds: string[] = []
    
    console.log(`添加 ${files.length} 个项目到下载队列`)
    
    for (const file of files) {
      if (file.isDir) {
        // 文件夹需要展开为文件
        const folderFileIds = await this.getFileIdsFromFolder(file.path)
        const folderFiles = await this.getFileDetails(folderFileIds)
        console.log(`文件夹 ${file.name} 展开为 ${folderFiles.length} 个文件`)
        const subIds = await this.addFilesToQueue(folderFiles)
        addedIds.push(...subIds)
      } else {
        // 单个文件
        const queueItem: DownloadQueueItem = {
          id: `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size,
          status: 'waiting',
          progress: 0,
          downloadedBytes: 0,
          speed: 0,
          eta: 0
        }
        
        this.downloadQueue.push(queueItem)
        addedIds.push(queueItem.id)
        console.log(`添加文件到队列: ${file.name} (${this.formatFileSize(file.size)})`)
      }
    }
    
    // 通知队列状态变化
    this.notifyQueueStatus()
    
    // 开始处理队列
    setTimeout(() => this.processQueue(), 100) // 稍微延迟确保UI更新
    
    return addedIds
  }

  /**
   * 处理下载队列（核心队列管理逻辑）
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return
    }
    
    this.isProcessingQueue = true
    console.log('开始处理下载队列')
    
    try {
      while (true) {
        // 检查是否还有等待中的文件
        const waitingItems = this.downloadQueue.filter(item => item.status === 'waiting')
        if (waitingItems.length === 0) {
          console.log('队列中没有等待下载的文件')
          break
        }
        
        // 检查当前并发数
        const downloadingItems = this.downloadQueue.filter(item => item.status === 'downloading')
        this.activeDownloads = downloadingItems.length
        
        if (this.activeDownloads >= this.maxConcurrentDownloads) {
          console.log(`已达到最大并发数 ${this.maxConcurrentDownloads}，等待下载完成`)
          // 等待有下载完成
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        
        // 找到下一个等待中的文件
        const nextItem = waitingItems[0]
        if (!nextItem) {
          break
        }
        
        console.log(`开始下载: ${nextItem.fileName} (并发: ${this.activeDownloads + 1}/${this.maxConcurrentDownloads})`)
        
        // 开始下载（异步，不等待完成）
        this.startSingleDownload(nextItem)
        
        // 稍微延迟，避免同时启动太多下载
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } finally {
      this.isProcessingQueue = false
      console.log('队列处理完成')
    }
  }

  /**
   * 开始单个文件下载（支持断点续传）
   * @param queueItem 队列项
   */
  private async startSingleDownload(queueItem: DownloadQueueItem): Promise<void> {
    try {
      console.log(`开始下载文件: ${queueItem.fileName}`)
      
      queueItem.status = 'downloading'
      queueItem.startTime = Date.now()
      queueItem.abortController = new AbortController()
      this.activeDownloads++
      
      // 如果是断点续传，从上次的位置开始
      const resumeFrom = queueItem.lastDownloadedPosition || 0
      if (resumeFrom > 0) {
        console.log(`断点续传: ${queueItem.fileName} 从 ${resumeFrom} 字节开始`)
      }
      
      this.notifyQueueStatus()
      
      // 开始流式下载（支持Range请求）
      const response = await this.downloadLargeFile(queueItem.fileId, resumeFrom, undefined, 0)
      
      if (!response.body) {
        throw new Error('无法获取响应流')
      }
      
      // 如果没有已下载的数据块，初始化
      if (!queueItem.chunks) {
        queueItem.chunks = []
      }
      
      // 流式下载并监控进度
      const reader = response.body.getReader()
      const startTime = Date.now()
      let lastProgressTime = startTime
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break
          if (!value) continue
          
          // 检查是否被取消或暂停
          if (queueItem.abortController?.signal.aborted) {
            // 保存当前下载位置用于断点续传
            queueItem.lastDownloadedPosition = queueItem.downloadedBytes
            console.log(`下载被暂停: ${queueItem.fileName}，已下载 ${queueItem.downloadedBytes} 字节`)
            throw new Error('下载被暂停')
          }
          
          // 保存数据块
          queueItem.chunks!.push(value)
          queueItem.downloadedBytes += value.length
          queueItem.progress = Math.min((queueItem.downloadedBytes / queueItem.fileSize) * 100, 100)
          
          // 计算下载速度和ETA
          const currentTime = Date.now()
          const elapsed = (currentTime - startTime) / 1000
          
          if (elapsed > 1) { // 至少1秒后才计算速度
            const currentSessionBytes = queueItem.downloadedBytes - resumeFrom
            queueItem.speed = currentSessionBytes / elapsed
            
            if (queueItem.speed > 0) {
              const remaining = queueItem.fileSize - queueItem.downloadedBytes
              queueItem.eta = remaining / queueItem.speed
            }
          }
          
          // 计算平滑的下载速度（解决速度跳动问题）
          this.calculateSmoothSpeed(queueItem, Date.now(), value.length)
          
          // 定期通知进度（避免过于频繁）
          if (currentTime - lastProgressTime > 500) { // 每500ms通知一次
            this.smoothNotifyQueueStatus() // 使用平滑通知
            lastProgressTime = currentTime
          }
        }
      } finally {
        reader.releaseLock()
      }
      
      // 下载完成，创建完整文件
      if (queueItem.downloadedBytes >= queueItem.fileSize) {
        const blob = new Blob(queueItem.chunks!)
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = queueItem.fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
        
        // 标记完成并清理数据
        queueItem.status = 'completed'
        queueItem.endTime = Date.now()
        queueItem.progress = 100
        queueItem.chunks = undefined // 清理内存
        queueItem.lastDownloadedPosition = undefined
        
        const downloadTime = ((queueItem.endTime - queueItem.startTime!) / 1000).toFixed(1)
        console.log(`文件 ${queueItem.fileName} 下载完成 (耗时: ${downloadTime}s)`)
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '下载失败'
      
      if (errorMessage === '下载被暂停') {
        // 暂停状态，不标记为失败
        console.log(`文件 ${queueItem.fileName} 下载暂停`)
      } else {
        queueItem.status = 'failed'
        queueItem.error = errorMessage
        queueItem.endTime = Date.now()
        console.error(`文件 ${queueItem.fileName} 下载失败:`, error)
      }
    } finally {
      this.activeDownloads--
      queueItem.abortController = undefined
      this.notifyQueueStatus()
      
      // 继续处理队列中的其他文件
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * 暂停队列中的文件下载
   * @param queueItemId 队列项ID
   */
  pauseDownload(queueItemId: string): void {
    const item = this.downloadQueue.find(item => item.id === queueItemId)
    if (item && item.status === 'downloading') {
      item.status = 'paused'
      item.abortController?.abort()
      this.activeDownloads--
      console.log(`暂停下载: ${item.fileName}`)
      this.notifyQueueStatus()
      
      // 继续处理队列中的其他文件
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * 恢复队列中的文件下载
   * @param queueItemId 队列项ID
   */
  resumeQueueDownload(queueItemId: string): void {
    const item = this.downloadQueue.find(item => item.id === queueItemId)
    if (item && item.status === 'paused') {
      item.status = 'waiting'
      console.log(`恢复下载: ${item.fileName}`)
      this.notifyQueueStatus()
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * 取消队列中的文件下载
   * @param queueItemId 队列项ID
   */
  cancelDownload(queueItemId: string): void {
    const item = this.downloadQueue.find(item => item.id === queueItemId)
    if (item) {
      if (item.status === 'downloading') {
        item.abortController?.abort()
        this.activeDownloads--
      }
      
      // 从队列中移除
      const index = this.downloadQueue.indexOf(item)
      if (index > -1) {
        this.downloadQueue.splice(index, 1)
        console.log(`取消下载: ${item.fileName}`)
      }
      
      this.notifyQueueStatus()
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * 清空已完成的下载项
   */
  clearCompletedDownloads(): void {
    const beforeCount = this.downloadQueue.length
    this.downloadQueue = this.downloadQueue.filter(item => 
      item.status !== 'completed' && item.status !== 'failed'
    )
    const afterCount = this.downloadQueue.length
    console.log(`清空已完成下载: 移除了 ${beforeCount - afterCount} 个项目`)
    this.notifyQueueStatus()
  }

  /**
   * 清空整个下载队列
   */
  clearAllDownloads(): void {
    // 取消所有正在下载的文件
    this.downloadQueue.forEach(item => {
      if (item.status === 'downloading') {
        item.abortController?.abort()
      }
    })
    
    console.log(`清空下载队列: 移除了 ${this.downloadQueue.length} 个项目`)
    this.downloadQueue = []
    this.activeDownloads = 0
    this.isProcessingQueue = false
    this.notifyQueueStatus()
  }

  /**
   * 重试失败的下载
   * @param queueItemId 队列项ID
   */
  retryDownload(queueItemId: string): void {
    const item = this.downloadQueue.find(item => item.id === queueItemId)
    if (item && item.status === 'failed') {
      // 重置下载状态
      item.status = 'waiting'
      item.downloadedBytes = 0
      item.progress = 0
      item.error = undefined
      item.speed = 0
      item.eta = 0
      delete item.startTime
      delete item.endTime
      
      console.log(`重试下载: ${item.fileName}`)
      this.notifyQueueStatus()
      setTimeout(() => this.processQueue(), 100)
    }
  }

  /**
   * 智能下载多个文件（完全前端化策略判断）
   * @param selectedFiles 选中的文件列表
   * @param zipName ZIP文件名（可选）
   * @returns 下载结果
   */
  async smartDownloadMultipleFiles(
    selectedFiles: FileInfo[], 
    zipName?: string
  ): Promise<{ strategy: string; queueIds?: string[]; downloadResponse?: DownloadResponse }> {
    try {
      // 计算下载信息（包括展开文件夹）
      const { totalSize, fileCount, fileIds } = await this.calculateDownloadInfo(selectedFiles)
      
      if (fileIds.length === 0) {
        throw new Error('没有可下载的文件')
      }

      console.log(`智能下载策略判断: ${fileCount}个文件, 总大小: ${this.formatFileSize(totalSize)}`)

      // 前端直接判断下载策略
      if (fileIds.length === 1) {
        // 单个文件
        const file = selectedFiles.find(f => !f.isDir) || selectedFiles[0]
        
        if (file.size >= this.LARGE_FILE_THRESHOLD) {
          // 单个大文件：添加到前端队列
          const queueIds = await this.addFilesToQueue([file])
          console.log('策略: 单个大文件使用队列下载')
          return { strategy: 'single_large_queue', queueIds }
        } else {
          // 单个小文件：使用直接下载
          const downloadResponse = await this.downloadFiles([file.id])
          console.log('策略: 单个小文件直接下载')
          return { strategy: 'single_small', downloadResponse }
        }
      }

      // 多个文件：完全基于前端判断
      if (totalSize >= this.LARGE_FILE_THRESHOLD) {
        // 总大小超过100MB或包含大文件：使用前端队列下载
        const hasLargeFile = selectedFiles.some(f => !f.isDir && f.size >= this.LARGE_FILE_THRESHOLD)
        const queueIds = await this.addFilesToQueue(selectedFiles)
        
        if (hasLargeFile) {
          console.log('策略: 包含大文件，使用队列并发下载')
        } else {
          console.log('策略: 总大小超过100MB，使用队列并发下载')
        }
        
        return { strategy: 'queue', queueIds }
      } else {
        // 总大小小于100MB：使用ZIP打包下载
        const downloadResponse = await this.downloadFiles(fileIds, zipName)
        console.log('策略: 多个小文件使用ZIP打包下载')
        return { strategy: 'zip', downloadResponse }
      }
    } catch (error) {
      console.error('智能下载失败:', error)
      throw error
    }
  }

  // ===== 大文件下载接口 =====

  /**
   * 获取下载进度信息
   * @param fileId 文件ID
   * @returns 下载进度信息
   */
  async getDownloadProgress(fileId: number): Promise<DownloadProgressInfo> {
    try {
      const response = await fetch(`${this.baseUrl}/files/download/${fileId}/progress`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AuthService.getAccessToken()}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`获取下载进度失败: ${response.statusText}`)
      }

      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('获取下载进度失败:', error)
      throw error
    }
  }

  /**
   * 大文件流式下载（支持断点续传）
   * @param fileId 文件ID
   * @param rangeStart 起始字节位置（可选，用于断点续传）
   * @param rangeEnd 结束字节位置（可选）
   * @param vipLevel VIP等级（可选，0=普通用户，1=VIP，2=SVIP）
   * @returns 下载响应对象
   */
  async downloadLargeFile(fileId: number, rangeStart?: number, rangeEnd?: number, vipLevel: number = 0): Promise<Response> {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${AuthService.getAccessToken()}`
      }

      // 添加Range请求头用于断点续传
      if (rangeStart !== undefined) {
        if (rangeEnd !== undefined) {
          headers['Range'] = `bytes=${rangeStart}-${rangeEnd}`
        } else {
          headers['Range'] = `bytes=${rangeStart}-`
        }
      }

      const response = await fetch(`${this.baseUrl}/files/download/${fileId}/stream?vip=${vipLevel}`, {
        method: 'GET',
        headers
      })

      if (!response.ok && response.status !== 206) { // 206 = Partial Content
        throw new Error(`下载失败: ${response.statusText}`)
      }

      return response
    } catch (error) {
      console.error('下载失败:', error)
      throw error
    }
  }

  /**
   * 智能下载单个文件（自动判断大小）
   * @param fileInfo 文件信息
   * @returns 下载结果
   */
  async smartDownloadSingleFile(fileInfo: FileInfo): Promise<void> {
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024 // 100MB

    try {
      if (fileInfo.size >= LARGE_FILE_THRESHOLD) {
        // 大文件：应该由调用方通过事件机制处理，这里抛出提示
        throw new Error('大文件下载应该使用进度监控模式，请通过事件机制处理')
      } else {
        // 小文件：使用原有的下载方式
        const downloadResponse = await this.downloadFiles([fileInfo.id])
        
        if (downloadResponse.type === 'single' && downloadResponse.files[0]?.dlink) {
          await this.directDownload(downloadResponse.files[0].dlink, fileInfo.name)
        } else {
          throw new Error('获取下载链接失败')
        }
      }
    } catch (error) {
      console.error('智能下载失败:', error)
      throw error
    }
  }

  /**
   * 带进度的大文件下载
   * @param fileInfo 文件信息
   * @param onProgress 进度回调函数
   * @param onComplete 完成回调函数
   * @param onError 错误回调函数
   */
  async downloadLargeFileWithProgress(
    fileInfo: FileInfo,
    onProgress?: (downloaded: number, total: number, speed: number) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // 1. 获取文件下载信息
      const progressInfo = await this.getDownloadProgress(fileInfo.id)
      
      // 2. 开始流式下载
      const response = await this.downloadLargeFile(fileInfo.id)
      
      if (!response.body) {
        throw new Error('无法获取响应流')
      }

      // 3. 流式下载并监控进度
      const chunks: Uint8Array[] = []
      const reader = response.body.getReader()
      let downloaded = 0
      const total = progressInfo.totalSize
      const startTime = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        if (!value) continue

        chunks.push(value)
        downloaded += value.length

        // 计算下载速度
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0 ? downloaded / elapsed : 0

        // 调用进度回调
        if (onProgress) {
          onProgress(downloaded, total, speed)
        }
      }

      // 4. 创建文件并下载
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileInfo.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log(`大文件 ${fileInfo.name} 下载完成`)
      
      // 调用完成回调
      if (onComplete) {
        onComplete()
      }
    } catch (error) {
      console.error('大文件下载失败:', error)
      
      // 调用错误回调
      if (onError) {
        onError(error as Error)
      }
      throw error
    }
  }

  /**
   * 断点续传下载（增强版）
   * @param fileInfo 文件信息
   * @param resumeFrom 从哪个字节开始续传
   * @param onProgress 进度回调函数
   * @param onComplete 完成回调函数
   * @param onError 错误回调函数
   */
  async resumeDownload(
    fileInfo: FileInfo, 
    resumeFrom: number,
    onProgress?: (downloaded: number, total: number, speed: number) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      // 1. 获取当前文件信息，验证断点续传的有效性
      const progressInfo = await this.getDownloadProgress(fileInfo.id)
      
      if (resumeFrom >= progressInfo.totalSize) {
        throw new Error('续传位置超出文件大小')
      }
      
      console.log(`从字节 ${resumeFrom} 开始续传下载 ${fileInfo.name}`)

      // 2. 发起Range请求
      const response = await this.downloadLargeFile(fileInfo.id, resumeFrom)
      
      if (!response.body) {
        throw new Error('无法获取响应流')
      }

      // 3. 检查响应状态
      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`服务器不支持断点续传，状态码: ${response.status}`)
      }

      // 4. 流式下载剩余部分
      const chunks: Uint8Array[] = []
      const reader = response.body.getReader()
      let downloaded = resumeFrom // 已下载的总字节数
      const total = progressInfo.totalSize
      const startTime = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        if (!value) continue

        chunks.push(value)
        downloaded += value.length

        // 计算下载速度
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0 ? (downloaded - resumeFrom) / elapsed : 0

        // 调用进度回调
        if (onProgress) {
          onProgress(downloaded, total, speed)
        }
      }

      // 5. 合并并下载文件
      // 注意：这里是简化版本，实际应用中需要与本地部分文件合并
      const blob = new Blob(chunks)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileInfo.name}.part` // 标记为部分文件
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log(`断点续传下载 ${fileInfo.name} 完成`)
      
      // 调用完成回调
      if (onComplete) {
        onComplete()
      }
    } catch (error) {
      console.error('断点续传失败:', error)
      
      // 调用错误回调
      if (onError) {
        onError(error as Error)
      }
      throw error
    }
  }

  /**
   * 检查文件是否支持断点续传
   * @param fileId 文件ID
   * @returns 是否支持断点续传
   */
  async checkResumeSupport(fileId: number): Promise<boolean> {
    try {
      const progressInfo = await this.getDownloadProgress(fileId)
      return progressInfo.acceptRanges
    } catch (error) {
      console.error('检查断点续传支持失败:', error)
      return false
    }
  }

  /**
   * 计算平滑的下载速度（解决速度跳动问题）
   * @param queueItem 队列项
   * @param currentTime 当前时间戳
   * @param newBytes 新增字节数
   */
  private calculateSmoothSpeed(queueItem: DownloadQueueItem, currentTime: number, newBytes: number): void {
    // 初始化速度计算相关字段
    if (!queueItem.speedHistory) {
      queueItem.speedHistory = []
      queueItem.lastSpeedUpdateTime = currentTime
      queueItem.lastBytesForSpeed = queueItem.downloadedBytes - newBytes
    }

    // 计算时间间隔（秒）
    const timeDelta = (currentTime - (queueItem.lastSpeedUpdateTime || currentTime)) / 1000
    
    // 至少间隔1秒才更新速度，避免过于频繁的计算
    if (timeDelta < 1.0) {
      return
    }

    // 计算瞬时速度（当前时间段的平均速度）
    const bytesDelta = queueItem.downloadedBytes - (queueItem.lastBytesForSpeed || 0)
    const instantSpeed = bytesDelta / timeDelta

    // 只有在下载了足够数据时才计算速度（避免初期不稳定）
    if (bytesDelta < 1024) { // 至少1KB数据
      return
    }

    // 添加到速度历史记录中
    queueItem.speedHistory.push(instantSpeed)
    
    // 保持最近10个速度样本，移除过旧的数据
    if (queueItem.speedHistory.length > 10) {
      queueItem.speedHistory.shift()
    }

    // 计算平滑速度：使用加权平均，最近的数据权重更高
    let totalWeight = 0
    let weightedSum = 0
    
    for (let i = 0; i < queueItem.speedHistory.length; i++) {
      // 权重从1到3，最新的数据权重最高
      const weight = 1 + (i / (queueItem.speedHistory.length - 1)) * 2
      weightedSum += queueItem.speedHistory[i] * weight
      totalWeight += weight
    }
    
    // 更新平滑后的速度
    queueItem.speed = totalWeight > 0 ? weightedSum / totalWeight : 0

    // 计算ETA（预计剩余时间）
    if (queueItem.speed > 0) {
      const remainingBytes = queueItem.fileSize - queueItem.downloadedBytes
      queueItem.eta = remainingBytes / queueItem.speed
    } else {
      queueItem.eta = 0
    }

    // 更新时间和字节记录
    queueItem.lastSpeedUpdateTime = currentTime
    queueItem.lastBytesForSpeed = queueItem.downloadedBytes

    // 调试日志（可选）
    if (queueItem.speedHistory.length === 1) {
      console.log(`${queueItem.fileName}: 开始稳定速度计算`)
    }
  }
}

// 导出默认实例
export default new FileDownloadService()
