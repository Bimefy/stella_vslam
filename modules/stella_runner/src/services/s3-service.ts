import { CreateMultipartUploadCommand, CompleteMultipartUploadCommand, GetObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../utils/aws-clients.js';
import type { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

export class S3Service {
  private bucketName: string;
  private logger: Logger;
  private readonly CHUNK_SIZE = 150 * 1024 * 1024; // 150MB chunks

  constructor(logger: Logger) {
    this.bucketName = process.env.S3_BUCKET_NAME || '';
    this.logger = logger;
  }

  async downloadFile(objectKey: string, localPath: string): Promise<boolean> {
    try {
      this.logger.info('---------------------Downloading file...---------------------');
      const presignedUrl = await this.generatePresignedUrl(objectKey);
      await this.downloadFromPresignedUrl(presignedUrl, localPath);
  
        // Check file size before processing
      const stats = fs.statSync(localPath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      this.logger.info(`Processing file of size: ${fileSizeInMB.toFixed(2)} MB`);
  
      // Add memory usage logging
      const memUsage = process.memoryUsage();
      this.logger.info(`Memory usage before processing: ${JSON.stringify({
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
      })}`);

      return true;
    } catch (error) {
      this.logger.error(`Failed to download file:`, error);
      return false;
    }
  }

  async generatePresignedUrl(objectKey: string, expirationSeconds = 3600): Promise<string> {
    try {
      this.logger.info('Generating presigned URL...');

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey
      });

      console.log('Generating presigned URL for', objectKey);
      const url = await getSignedUrl(s3Client, command, { expiresIn: expirationSeconds });
      console.log('Generated presigned URL for', objectKey, url);
      this.logger.debug(`Generated presigned URL for ${objectKey}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for ${objectKey}:`, error);
      throw error;
    }
  }

  async downloadFromPresignedUrl(presignedUrl: string, localPath: string): Promise<boolean> {
    try {
      this.logger.info(`Downloading from presigned URL to ${localPath}...`);
      
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      const fileStream = fs.createWriteStream(localPath);
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('Response body reader is null');
      }

      let bytesWritten = 0;
      let bytesWrittenThisSecond = 0;
      const contentLength = Number(response.headers.get('content-length'));
      const startTime = Date.now();
      let lastLogTime = startTime;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        if (value) {
          fileStream.write(value);
          bytesWritten += value.length;
          bytesWrittenThisSecond += value.length;

          const currentTime = Date.now();
          const elapsedSeconds = (currentTime - lastLogTime) / 1000;

          if (elapsedSeconds >= 1) {
            const speedMBps = (bytesWrittenThisSecond / (1024 * 1024)) / elapsedSeconds;
            const percentage = contentLength ? Math.round((bytesWritten / contentLength) * 100) : 0;
            
            this.logger.info(
              `Download: ${percentage}% complete | ` +
              `Speed: ${speedMBps.toFixed(2)} MB/s | ` +
              `Total: ${Math.round(bytesWritten / (1024 * 1024))}MB` +
              (contentLength ? `/${Math.round(contentLength / (1024 * 1024))}MB` : '')
            );

            bytesWrittenThisSecond = 0;
            lastLogTime = currentTime;
          }
        }
      }

      fileStream.end();

      await new Promise((resolve, reject) => {
        fileStream.on('finish', () => resolve(true));
        fileStream.on('error', reject);
      });

      const totalTime = (Date.now() - startTime) / 1000;
      const avgSpeed = (bytesWritten / (1024 * 1024)) / totalTime;
      this.logger.info(`Download completed successfully in ${totalTime.toFixed(2)}s (avg ${avgSpeed.toFixed(2)} MB/s)`);
      return true;

    } catch (error) {
      this.logger.error('Failed to download from presigned URL:', error);
      return false;
    }
  }

  private async uploadFilePart(buffer: Buffer, s3Key: string, uploadId: string, partNumber: number): Promise<{ PartNumber: number, ETag: string }> {
    const response = await s3Client.send(new UploadPartCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer
    }));

    return {
      PartNumber: partNumber,
      ETag: response.ETag!
    };
  }

  async uploadFile(filePath: string, s3Key: string, metadata?: Record<string, string>): Promise<string | null> {
    console.log('Uploading file to S3:', filePath, s3Key);
    try {
      this.logger.debug(`Uploading '${filePath}' to S3 as '${s3Key}'...`);
      
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;
      
      const { UploadId } = await s3Client.send(new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Metadata: metadata
      }));

      const numChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
      const fileHandle = fs.openSync(filePath, 'r');
      const parts = [];
      
      this.logger.info(`Starting multipart S3 upload: file=${path.basename(filePath)}, size=${fileSize} bytes, key=${s3Key}`);

      for (let i = 0; i < numChunks; i++) {
        const start = i * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, fileSize);
        const chunkSize = end - start;

        const buffer = Buffer.alloc(chunkSize);
        fs.readSync(fileHandle, buffer, 0, chunkSize, start);

        const part = await this.uploadFilePart(buffer, s3Key, UploadId!, i + 1);
        parts.push(part);

        const progress = Math.round((end / fileSize) * 100);
        this.logger.debug(`Uploaded part ${i + 1}/${numChunks} (${progress}% complete)`);
      }

      fs.closeSync(fileHandle);

      await s3Client.send(new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        UploadId: UploadId,
        MultipartUpload: { Parts: parts }
      }));
      
      const s3Url = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'eu-west-1'}.amazonaws.com/${s3Key}`;
      this.logger.info(`S3 upload complete: file=${path.basename(filePath)}, size=${fileSize} bytes, key=${s3Key}`);
      return s3Url;

    } catch (error) {
      this.logger.error(`S3 upload failed:`, error);
      return null;
    }
  }

  async uploadDirectory(directoryPath: string, s3BaseKey: string, metadata?: Record<string, string>): Promise<string[] | null> {
    try {
      this.logger.debug(`Uploading directory '${directoryPath}' to S3 base path '${s3BaseKey}'...`);
      
      if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
        this.logger.error(`Directory does not exist or is not a directory: ${directoryPath}`);
        return null;
      }
      
      const files = fs.readdirSync(directoryPath)
        .filter(fileName => fs.statSync(path.join(directoryPath, fileName)).isFile());
      
      if (files.length === 0) {
        this.logger.warn(`No files found in directory: ${directoryPath}`);
        return [];
      }
      
      this.logger.info(`Uploading ${files.length} files from directory ${directoryPath} to S3`);
      
      const results = [];
      let uploadedCount = 0;

      for (const fileName of files) {
        try {
          const filePath = path.join(directoryPath, fileName);
          const s3Key = `${s3BaseKey}/${fileName}`.replace(/\\/g, '/').replace(/\/+/g, '/');
          const fileMetadata = { ...metadata, filename: fileName };

          this.logger.info(`Uploading file ${fileName} (${uploadedCount + 1}/${files.length})`);
          
          const url = await this.uploadFile(filePath, s3Key, fileMetadata);
          
          if (url) {
            results.push(url);
            uploadedCount++;
            this.logger.info(`Successfully uploaded ${fileName} (${uploadedCount}/${files.length})`);
          } else {
            this.logger.warn(`Failed to upload ${fileName}`);
          }
        } catch (error) {
          this.logger.error(`Error uploading ${fileName}:`, error);
        }
      }

      if (results.length === 0) {
        this.logger.error(`Failed to upload any files from directory: ${directoryPath}`);
        return null;
      }
      
      if (results.length < files.length) {
        this.logger.warn(`Partially uploaded directory: ${results.length}/${files.length} files uploaded`);
      } else {
        this.logger.info(`Successfully uploaded all ${files.length} files from directory: ${directoryPath}`);
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Failed to upload directory:`, error);
      return null;
    }
  }
}