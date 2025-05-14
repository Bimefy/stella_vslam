import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Logger } from '../utils/logger';
import { S3Service } from './s3-service';
import { updateProcessingStatus } from '../lib/status-updater';
import { fileCleanup } from '../lib/file-cleanup';
import { StellaRunner } from './stella-runner';
import { STELLA_VS_LAM_OUTPUT_DB_FILE, STELLA_VS_LAM_OUTPUT_DIR, STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE, STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE, STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE } from '../constant';

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
      tempDir = fs.mkdtempSync(path.join("/tmp", 'stella-processor-'));
      // tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-processor-'));

      this.logger.info(`Temporary directory created: ${tempDir}`);
      
      // Generate file paths
      const mp4Path = path.basename(objectKey);
      
      const mp4Filename = mp4Path.split('/').pop();
      const keyPath = mp4Path.split('/').slice(0, -1).join('/');
      const odometryKeyPath = mp4Path.split('/').slice(0, -1).join('/') + '/' + STELLA_VS_LAM_OUTPUT_DIR;
      
      const outputDBPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_DB_FILE);
      const outputFrameTrajectoryPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE);
      const outputKeyframeTrajectoryPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE);
      const outputTrackTimesPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE);

      
      const localMp4Path = path.join(tempDir, mp4Path);
    
      await this.s3Service.downloadFile(objectKey, localMp4Path);

      await this.stellaRunner.runStellaVSlamProcessing(localMp4Path, tempDir);

      await this.s3Service.uploadFile(outputDBPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_DB_FILE}`);
      await this.s3Service.uploadFile(outputFrameTrajectoryPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE}`);
      await this.s3Service.uploadFile(outputKeyframeTrajectoryPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE}`);
      await this.s3Service.uploadFile(outputTrackTimesPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE}`);
      
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