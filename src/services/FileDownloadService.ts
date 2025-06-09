// 文件下载服务
import config from '@/config'
import AuthService from './AuthService'

// 下载请求
interface DownloadRequest {
  fileIds: number[]
  zipName?: string
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
}

// 导出默认实例
export default new FileDownloadService()
