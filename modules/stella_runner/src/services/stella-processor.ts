import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Logger } from '../utils/logger';
import { S3Service } from './s3-service';
import { updateProcessingStatus } from '../lib/status-updater';
import { fileCleanup } from '../lib/file-cleanup';
import { StellaRunner } from './stella-runner';

export class StellaProcessor {
  private logger: Logger;
  private s3Service: S3Service;
  private stellaRunner: StellaRunner;

  constructor(logger: Logger) {
    this.logger = logger;
    this.s3Service = new S3Service(logger);
    this.stellaRunner = new StellaRunner(logger);
  }

  async processMp4File(objectKey: string): Promise<boolean> {
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('---------------------Starting STELLA file processing...---------------------');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');


    await updateProcessingStatus(this.logger, objectKey, 'stella_processing');

    let tempDir: string | undefined;

    try {
      this.logger.info('Creating temporary directory...');
      // Create temporary directory for processing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-processor-'));
      
      // Generate file paths
      const mp4Filename = path.basename(objectKey);
      const localMp4Path = path.join(tempDir, mp4Filename);
    
      await this.s3Service.downloadFile(objectKey, localMp4Path);

      await this.stellaRunner.runStellaVSlamProcessing(localMp4Path);


      
    } catch (error) {
      this.logger.error(`ERROR: Exception during MP4 stella processing:`, error);
      await updateProcessingStatus(this.logger, objectKey, 'failed');
      return false;
    } finally {
      // Clean up temporary directory
      if (tempDir) {
        // await fileCleanup(this.logger, tempDir, objectKey);
      }
    }

    return true;
  }
}