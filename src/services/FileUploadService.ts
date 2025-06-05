// 优化的文件上传服务
import config from '@/config'
import AuthService from './AuthService'

// 上传选项
interface UploadOptions {
  onProgress?: (progress: number) => void; // 进度回调
  signal?: AbortSignal;         // 用于中止上传的信号
}

// 文件上传结果
interface UploadResult {
  fileId?: number;
  existed?: boolean;
  message?: string;
  fileUrl?: string;
}

// 上传的分块信息
interface UploadedChunk {
  partNumber: number;
  etag: string;
}

// 分块状态信息（用于断点续传）
interface PartStatus {
  objectKey: string;
  etag: string;
}

class FileUploadService {
  
  /**
   * 上传文件（统一入口，自动选择最优方式）
   * @param file 文件对象
   * @param parentPath 父目录路径
   * @param options 上传选项
   */
  async uploadFile(file: File, parentPath: string, options?: UploadOptions): Promise<UploadResult> {
    const hash = await this.calculateFileHash(file, options?.onProgress);
    
    // 根据文件大小选择上传方式
    const fileSizeGB = file.size / (1024 * 1024 * 1024);
    
    if (fileSizeGB < 0.1) { // 小于100MB，使用普通上传
      return this.uploadSmallFile(file, parentPath, hash, options);
    } else { // 大于100MB，使用优化分块上传
      return this.uploadLargeFileOptimized(file, parentPath, hash, options);
    }
  }

  /**
   * 普通上传小文件
   * @param file 文件对象
   * @param parentPath 父目录路径
   * @param hash 文件哈希
   * @param options 上传选项
   */
  private async uploadSmallFile(file: File, parentPath: string, hash: string, options?: UploadOptions): Promise<UploadResult> {
    // 1. 预上传检查
    const checkResult = await this.preUploadCheck(file.name, file.size, hash, parentPath);
    
    // 如果文件已存在，直接返回
    if (checkResult.fileExists) {
      return {
        fileId: checkResult.fileId,
        existed: true,
        message: '文件已存在（秒传）'
      };
    }

    // 2. 上传到存储
    options?.onProgress?.(50);
    await this.uploadToStorage(checkResult.presignedUrl, file, options?.signal);

    // 3. 确认上传
    options?.onProgress?.(90);
    const filePath = parentPath === '/' ? 
      `/${file.name}` : 
      `${parentPath}/${file.name}`;
      
    const result = await this.confirmUpload(file, hash, checkResult.presignedUrl, filePath);
    
    options?.onProgress?.(100);
    return {
      fileId: result.fileId,
      fileUrl: result.fileUrl,
      message: '上传成功'
    };
  }

  /**
   * 优化的大文件分块上传（支持断点续传）
   * @param file 文件对象  
   * @param parentPath 父目录路径
   * @param hash 文件哈希
   * @param options 上传选项
   */
  private async uploadLargeFileOptimized(file: File, parentPath: string, hash: string, options?: UploadOptions): Promise<UploadResult> {
    // 1. 初始化优化上传（已包含断点续传状态）
    options?.onProgress?.(5);
    const initResult = await this.initOptimizedUpload(file, parentPath, hash);
    
    // 如果文件已存在，直接返回
    if (initResult.fileExists) {
      return {
        fileId: initResult.fileId,
        existed: true,
        message: '文件已存在（秒传）'
      };
    }

    // 2. 从初始化结果中获取已上传分块状态（无需额外查询）
    const { uploadId, chunkUrls, optimalChunkSize, recommendedConcurrency, existingParts } = initResult;
    const uploadStatus = existingParts || []; // 使用初始化时返回的状态
    
    console.log('初始化上传完成，已上传分块数:', uploadStatus.length);
    
    // 3. 分块上传（跳过已上传的分块）
    const uploadedChunks = await this.uploadChunksWithResume(
      file, 
      chunkUrls, 
      optimalChunkSize, 
      recommendedConcurrency,
      uploadStatus,
      (progress) => options?.onProgress?.(5 + progress * 0.85), // 5%-90%
      options?.signal
    );

    // 4. 完成上传
    options?.onProgress?.(95);
    const filePath = parentPath === '/' ? 
      `/${file.name}` : 
      `${parentPath}/${file.name}`;
    const result = await this.completeOptimizedUpload(uploadId, file, parentPath, hash, uploadedChunks);
    
    options?.onProgress?.(100);
    return {
      fileId: result.fileId,
      fileUrl: result.fileUrl,
      message: '大文件上传成功'
    };
  }

  /**
   * 预上传检查
   */
  private async preUploadCheck(name: string, size: number, hash: string, parentPath: string) {
    const response = await fetch(`${config.apiBaseUrl}/files/precreate`, {
      method: 'POST',
      headers: AuthService.createAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        name,
        size,
        hash,
        parentPath
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 处理可能的令牌刷新
    AuthService.handleResponse(response);

    const result = await response.json();
    if (result.code !== 20000) {
      throw new Error(result.msg || '预上传检查失败');
    }

    return result.data;
  }

  /**
   * 上传到存储
   */
  private async uploadToStorage(presignedUrl: string, file: File, signal?: AbortSignal) {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      signal
    });

    if (!response.ok) {
      throw new Error(`上传失败: HTTP ${response.status}`);
    }
  }

  /**
   * 确认上传
   */
  private async confirmUpload(file: File, hash: string, presignedUrl: string, filePath: string) {
    const fileUrl = presignedUrl.split('?')[0];
    
    const response = await fetch(`${config.apiBaseUrl}/files/create`, {
      method: 'POST',
      headers: AuthService.createAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        name: file.name,
        path: filePath,
        size: file.size,
        hash: hash,
        url: fileUrl,
        isDir: false,
        deviceId: 'web-client'
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 处理可能的令牌刷新
    AuthService.handleResponse(response);

    const result = await response.json();
    if (result.code !== 20000) {
      throw new Error(result.msg || '确认上传失败');
    }

    return result.data;
  }

  /**
   * 初始化优化上传
   */
  private async initOptimizedUpload(file: File, parentPath: string, hash: string) {
    const response = await fetch(`${config.apiBaseUrl}/files/preupload`, {
      method: 'POST',
      headers: AuthService.createAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        hash: hash,
        parentPath: parentPath,
        preferredChunkSize: 5 * 1024 * 1024, // 5MB
        deviceInfo: navigator.userAgent
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 处理可能的令牌刷新
    AuthService.handleResponse(response);

    const result = await response.json();
    if (result.code !== 20000) {
      throw new Error(result.msg || '初始化优化上传失败');
    }

    return result.data;
  }

  /**
   * 获取上传状态（用于断点续传）
   * 注意：正常情况下不需要单独调用此方法，因为InitUpload已包含状态信息
   * 此方法保留用于特殊情况下的状态查询
   */
  private async getUploadStatus(uploadId: string): Promise<PartStatus[]> {
    try {
      const response = await fetch(`${config.apiBaseUrl}/files/upload/status?uploadId=${encodeURIComponent(uploadId)}`, {
        method: 'GET',
        headers: AuthService.createAuthHeaders(),
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn(`获取上传状态失败: HTTP ${response.status}`);
        return [];
      }

      // 处理可能的令牌刷新
      AuthService.handleResponse(response);

      const result = await response.json();
      if (result.code !== 20000) {
        console.warn('获取上传状态业务逻辑失败:', result.msg);
        return [];
      }

      console.log('获取到已上传分块状态:', result.data);
      return result.data || [];
    } catch (error) {
      console.warn('获取上传状态出错:', error);
      return [];
    }
  }

  /**
   * 支持断点续传的分块上传
   */
  private async uploadChunksWithResume(
    file: File,
    chunkUrls: any[],
    chunkSize: number,
    concurrency: number,
    existingParts: PartStatus[],
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<UploadedChunk[]> {
    const totalChunks = Math.ceil(file.size / chunkSize);
    let completedChunks = 0;

    console.log('开始支持断点续传的分块上传:', {
      totalChunks,
      concurrency,
      chunkSize,
      chunkUrlsCount: chunkUrls.length,
      existingPartsCount: existingParts.length
    });

    // 解析已上传分块信息
    const existingChunks = new Map<number, string>(); // partNumber -> etag
    for (const part of existingParts) {
      const partNumber = this.extractPartNumberFromObjectKey(part.objectKey);
      if (partNumber > 0) {
        existingChunks.set(partNumber, part.etag);
        console.log(`发现已上传分块: ${partNumber}, ETag: ${part.etag}`);
      }
    }

    // 创建任务函数（只为未上传的分块创建任务）
    const taskFunctions: (() => Promise<UploadedChunk>)[] = [];
    const results: UploadedChunk[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const expectedPartNumber = i + 1;
      
      // 检查是否已存在
      if (existingChunks.has(expectedPartNumber)) {
        const existingEtag = existingChunks.get(expectedPartNumber)!;
        results[i] = { partNumber: expectedPartNumber, etag: existingEtag };
        completedChunks++;
        console.log(`跳过已上传分块: ${expectedPartNumber}, 使用现有ETag: ${existingEtag}`);
        continue;
      }

      // 需要上传的分块
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkUrl = chunkUrls.find(url => url.partNumber === expectedPartNumber);

      if (!chunkUrl) {
        throw new Error(`未找到分块 ${expectedPartNumber} 的上传URL`);
      }

      // 创建上传任务
      taskFunctions.push(async () => {
        const chunk = file.slice(start, end);
        const etag = await this.uploadSingleChunk(chunk, chunkUrl.presignedUrl, expectedPartNumber, signal);
        completedChunks++;
        onProgress?.(completedChunks / totalChunks);
        console.log(`新上传分块 ${expectedPartNumber}/${totalChunks} 完成, ETag: ${etag}`);
        return { partNumber: expectedPartNumber, etag };
      });
    }

    // 更新初始进度（包含已存在的分块）
    onProgress?.(completedChunks / totalChunks);

    // 如果有需要上传的分块，则并发执行
    if (taskFunctions.length > 0) {
      console.log(`需要上传 ${taskFunctions.length} 个分块，跳过了 ${existingChunks.size} 个已存在分块`);
      const newResults = await this.limitConcurrency(taskFunctions, concurrency);
      
      // 将新上传的结果合并到结果数组中
      let newResultIndex = 0;
      for (let i = 0; i < totalChunks; i++) {
        if (!results[i]) {
          results[i] = newResults[newResultIndex++];
        }
      }
    } else {
      console.log('所有分块均已存在，无需重新上传');
    }

    return results.sort((a, b) => a.partNumber - b.partNumber);
  }

  /**
   * 从对象键中提取分块编号
   * 对象键格式：{uid}/chunks/{uploadId}/{partNumber}
   */
  private extractPartNumberFromObjectKey(objectKey: string): number {
    const parts = objectKey.split('/');
    if (parts.length >= 4 && parts[1] === 'chunks') {
      const partNumber = parseInt(parts[3], 10);
      return isNaN(partNumber) ? 0 : partNumber;
    }
    return 0;
  }
  private async completeOptimizedUpload(uploadId: string, file: File, parentPath: string, hash: string, uploadedChunks: UploadedChunk[]) {
    console.log('开始完成优化上传:', {
      uploadId,
      fileName: file.name,
      parentPath,
      hash,
      uploadedChunksCount: uploadedChunks.length,
      uploadedChunks: uploadedChunks.sort((a, b) => a.partNumber - b.partNumber)
    });

    const response = await fetch(`${config.apiBaseUrl}/files/upload/complete?uploadId=${uploadId}`, {
      method: 'POST',
      headers: AuthService.createAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        uploadedChunks: uploadedChunks,
        fileHash: hash,
        fileName: file.name,
        parentPath: parentPath,
        clientFingerprint: 'web-client'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('完成优化上传失败:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    // 处理可能的令牌刷新
    AuthService.handleResponse(response);

    const result = await response.json();
    if (result.code !== 20000) {
      console.error('完成优化上传业务逻辑失败:', result);
      throw new Error(result.msg || '完成优化上传失败');
    }

    console.log('优化上传完成成功:', result);
    return result.data;
  }

  /**
   * 并行上传分块
   */
  private async uploadChunksParallel(
    file: File,
    chunkUrls: any[],
    chunkSize: number,
    concurrency: number,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<UploadedChunk[]> {
    const totalChunks = Math.ceil(file.size / chunkSize);
    let completedChunks = 0;

    console.log('开始并行上传分块:', {
      totalChunks,
      concurrency,
      chunkSize,
      chunkUrlsCount: chunkUrls.length
    });

    // 创建任务函数（不立即执行）
    const taskFunctions: (() => Promise<UploadedChunk>)[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const expectedPartNumber = i + 1;
      const chunkUrl = chunkUrls.find(url => url.partNumber === expectedPartNumber);

      if (!chunkUrl) {
        console.error('可用的分块URL:', chunkUrls.map(u => ({ partNumber: u.partNumber, url: u.presignedUrl?.substring(0, 50) + '...' })));
        throw new Error(`未找到分块 ${expectedPartNumber} 的上传URL，总共有 ${chunkUrls.length} 个分块URL`);
      }

      // 创建任务函数，稍后执行
      taskFunctions.push(async () => {
        const chunk = file.slice(start, end);
        const etag = await this.uploadSingleChunk(chunk, chunkUrl.presignedUrl, expectedPartNumber, signal);
        completedChunks++;
        onProgress?.(completedChunks / totalChunks);
        console.log(`分块 ${expectedPartNumber}/${totalChunks} 上传完成`);
        return { partNumber: expectedPartNumber, etag };
      });
    }

    // 限制并发数执行
    const results = await this.limitConcurrency(taskFunctions, concurrency);
    return results.sort((a, b) => a.partNumber - b.partNumber);
  }

  /**
   * 上传单个分块
   */
  private async uploadSingleChunk(chunk: Blob, presignedUrl: string, partNumber: number, signal?: AbortSignal): Promise<string> {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: chunk,
      signal
    });

    if (!response.ok) {
      throw new Error(`分块 ${partNumber} 上传失败: HTTP ${response.status}`);
    }

    return response.headers.get('ETag') || `chunk-${partNumber}`;
  }

  /**
   * 限制并发执行
   */
  private async limitConcurrency<T>(taskFunctions: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    // 创建工作器池
    const workers = Array(Math.min(limit, taskFunctions.length)).fill(null).map(async () => {
      while (index < taskFunctions.length) {
        const taskIndex = index++;
        try {
          const result = await taskFunctions[taskIndex]();
          results[taskIndex] = result; // 保持结果顺序
        } catch (error) {
          throw new Error(`Task ${taskIndex + 1} failed: ${error}`);
        }
      }
    });

    // 等待所有工作器完成
    await Promise.all(workers);
    return results;
  }

  /**
   * 计算最优分块大小
   */
  private calculateOptimalChunkSize(fileSize: number): number {
    // 根据文件大小计算最优分块大小
    if (fileSize < 100 * 1024 * 1024) { // 小于100MB
      return 5 * 1024 * 1024; // 5MB
    } else if (fileSize < 1024 * 1024 * 1024) { // 小于1GB
      return 10 * 1024 * 1024; // 10MB
    } else if (fileSize < 10 * 1024 * 1024 * 1024) { // 小于10GB
      return 20 * 1024 * 1024; // 20MB
    } else {
      return 50 * 1024 * 1024; // 50MB
    }
  }

  /**
   * 计算文件哈希值
   */
  private async calculateFileHash(file: File, onProgress?: (progress: number) => void): Promise<string> {
    if (file.size < 100 * 1024 * 1024) {
      // 小文件直接计算完整哈希
      return this.calculateBlobHash(file);
    } else {
      // 大文件采样计算
      const sampleSize = 1024 * 1024; // 1MB 样本
      const samples = [];
      
      // 取文件开头
      samples.push(file.slice(0, sampleSize));
      
      // 取文件中间
      const middle = Math.floor(file.size / 2);
      samples.push(file.slice(middle, middle + sampleSize));
      
      // 取文件结尾
      samples.push(file.slice(-sampleSize));
      
      // 合并样本
      const combinedBlob = new Blob(samples);
      const hash = await this.calculateBlobHash(combinedBlob);
      
      // 添加文件大小和修改时间信息，确保唯一性
      return `${hash}-${file.size}-${file.lastModified}`;
    }
  }

  /**
   * 计算Blob对象的哈希值 - 使用 Web Crypto API
   */
  private async calculateBlobHash(blob: Blob): Promise<string> {
    try {
      // 尝试使用 Web Crypto API
      const arrayBuffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      // 如果 Web Crypto API 不可用，使用简单的哈希算法
      console.warn('Web Crypto API not available, using fallback hash');
      const text = await blob.text();
      return this.simpleHash(text);
    }
  }

  /**
   * 简单哈希算法 (fallback)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// 导出单例
export default new FileUploadService();
