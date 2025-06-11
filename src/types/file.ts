// 文件相关类型定义
export interface FileItem {
  id: number
  name: string
  size: number
  type: string
  url?: string
  hash?: string
  isDirectory: boolean
  modifiedAt: string
  createdAt: string
  path: string
  status?: number
}

// 预览相关类型 - 与后端PreviewFileResp匹配
export interface PreviewData {
  fileId: number
  fileName: string
  fileType: string // image/text/pdf/video/audio/office
  previewType: string // direct/kkfileview/text/none
  previewUrl: string // 预览URL
  thumbnailUrl?: string // 缩略图URL（如果有）
  contentType: string // MIME类型
  size: number // 文件大小
  isEditable: boolean // 是否可编辑
  textContent?: string // 文本内容（仅文本文件）
  duration?: number // 视频/音频时长（秒）
  width?: number // 图片/视频宽度
  height?: number // 图片/视频高度
  maxPreviewSize: number // 最大预览大小限制
}

// 文件内容更新相关类型
export interface PrepareContentUpdateRequest {
  content: string
}

export interface PrepareContentUpdateResponse {
  success: boolean
  newHash: string
  newSize: number
  updateTime: number
  presignedUrl: string
}

export interface ConfirmContentUpdateRequest {
  hash: string
  size: number
}

// KKFileView健康检查响应
export interface KKFileViewHealthResponse {
  code: number
  msg: string
  data?: string
}

// 文件上传相关类型
export interface UploadProgress {
  fileId: string
  fileName: string
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

// 文件下载相关类型
export interface DownloadProgress {
  fileId: number
  fileName: string
  progress: number
  status: 'pending' | 'downloading' | 'completed' | 'error'
  error?: string
  size: number
  downloadedSize: number
}

// 文件下载请求和响应类型
export interface DownloadFileRequest {
  fileIds: number[]
  zipName?: string
}

export interface DownloadFileResponse {
  type: string // single/zip
  totalSize: number
  zipName?: string
  dlink?: string // 直接下载链接（单文件时）
}

// 文件操作响应类型
export interface FileOperationResponse {
  code: number
  msg: string
  data?: any
}

// 文件列表响应类型
export interface FileListResponse {
  code: number
  msg: string
  data: {
    path: string
    contents: FileItem[]
    total: number
  }
}

// 存储信息类型
export interface StorageInfo {
  totalStorage: number
  usedStorage: number
  availableStorage: number
  fileCount: number
  folderCount: number
}

// 文件统计信息类型 - 与后端FileStatsResp匹配
export interface FileStatsResponse {
  totalFiles: number
  totalFolders: number
  totalSize: number
  totalSpace: number
  usedSpace: number
}

// 文件创建相关类型
export interface CreateFileRequest {
  name: string
  path: string
  size?: number
  hash?: string
  url?: string
  isDir: boolean
  deviceId?: string
}

export interface CreateItemResponse {
  id: number
  name: string
  path: string
  isDir: boolean
  ctime: number
}

// 文件更新相关类型
export interface UpdateFileRequest {
  name?: string
  newPath?: string
  hash?: string
  size?: number
  url?: string
  deviceId?: string
}

// 支持的文件类型枚举
export enum FileType {
  TEXT = 'text',
  IMAGE = 'image',
  PDF = 'pdf',
  VIDEO = 'video',
  AUDIO = 'audio',
  OFFICE = 'office',
  UNKNOWN = 'unknown'
}

// 预览类型枚举
export enum PreviewType {
  DIRECT = 'direct',
  KKFILEVIEW = 'kkfileview',
  TEXT = 'text',
  NONE = 'none'
}

// 文件大小限制常量
export const FILE_SIZE_LIMITS = {
  MAX_PREVIEW_SIZE: 50 * 1024 * 1024, // 50MB
  LARGE_FILE_THRESHOLD: 100 * 1024 * 1024, // 100MB
  SMALL_FILE_THRESHOLD: 10 * 1024 * 1024 // 10MB
} as const

// 支持的文件扩展名
export const SUPPORTED_EXTENSIONS = {
  TEXT: ['txt', 'md', 'json', 'xml', 'csv', 'html', 'htm', 'css', 'js', 'ts', 'go', 'py', 'java', 'cpp', 'c', 'log', 'yaml', 'yml', 'ini', 'conf'] as const,
  IMAGE: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] as const,
  PDF: ['pdf'] as const,
  VIDEO: ['mp4', 'webm', 'avi', 'mkv', 'mov'] as const,
  AUDIO: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'] as const,
  OFFICE: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'] as const
} as const

// 工具函数：获取文件类型
export function getFileTypeByExtension(fileName: string): FileType {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (!extension) return FileType.UNKNOWN

  if ((SUPPORTED_EXTENSIONS.TEXT as readonly string[]).includes(extension)) return FileType.TEXT
  if ((SUPPORTED_EXTENSIONS.IMAGE as readonly string[]).includes(extension)) return FileType.IMAGE
  if ((SUPPORTED_EXTENSIONS.PDF as readonly string[]).includes(extension)) return FileType.PDF
  if ((SUPPORTED_EXTENSIONS.VIDEO as readonly string[]).includes(extension)) return FileType.VIDEO
  if ((SUPPORTED_EXTENSIONS.AUDIO as readonly string[]).includes(extension)) return FileType.AUDIO
  if ((SUPPORTED_EXTENSIONS.OFFICE as readonly string[]).includes(extension)) return FileType.OFFICE

  return FileType.UNKNOWN
}

// 工具函数：判断文件是否支持预览
export function isPreviewSupported(fileName: string): boolean {
  const fileType = getFileTypeByExtension(fileName)
  return fileType !== FileType.UNKNOWN
}

// 工具函数：判断文件是否可编辑
export function isFileEditable(fileName: string): boolean {
  const fileType = getFileTypeByExtension(fileName)
  return fileType === FileType.TEXT
}