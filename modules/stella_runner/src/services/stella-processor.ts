import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Logger } from '../utils/logger';
import { S3Service } from './s3-service';
import { updateProcessingStatus } from '../lib/status-updater';
import { fileCleanup } from '../lib/file-cleanup';
import { StellaRunner } from './stella-runner';
import { STELLA_VS_LAM_OUTPUT_DB_FILE, STELLA_VS_LAM_OUTPUT_DIR, STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE, STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE, STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE } from '../constant';
import { ParseService } from './parse-service';
import { MetadataService } from './metadata-service';
import { FFmpegService } from './ffmpeg-service';

export class StellaProcessor {
  private logger: Logger;
  private s3Service: S3Service;
  private stellaRunner: StellaRunner;
  private parseService: ParseService;
  private metadataService: MetadataService;
  private ffmpegService: FFmpegService;

  constructor(logger: Logger) {
    this.logger = logger;
    this.s3Service = new S3Service(logger);
    this.stellaRunner = new StellaRunner(logger);
    this.parseService = new ParseService(logger);
    this.metadataService = new MetadataService(logger);
    this.ffmpegService = new FFmpegService(logger);
  }

  async processMp4File(objectKey: string): Promise<boolean> {
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('---------------------Starting STELLA file processing...---------------------');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
    this.logger.info('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');

    await updateProcessingStatus(this.logger, objectKey, 'in_progress');

    let tempDir: string | undefined;

    try {
      this.logger.info('Creating temporary directory...');
      
      tempDir = fs.mkdtempSync(path.join("/tmp", 'stella-processor-'));
      // tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-processor-'));

      this.logger.info(`Temporary directory created: ${tempDir}`);
      
      // Generate file paths
      const mp4Path = path.basename(objectKey);
      const baseKeyPath = objectKey.split('/').slice(0, -1).join('/');

      const localMp4Path = path.join(tempDir, mp4Path);
    
      await this.s3Service.downloadFile(objectKey, localMp4Path);

      await updateProcessingStatus(this.logger, objectKey, 'parsing_slam');
      await this.stellaRunner.runStellaVSlamProcessing(localMp4Path, tempDir);

      await this.uploadResult(objectKey, tempDir, baseKeyPath);

      const normalizedData = await this.parseService.parseData(tempDir);

      await this.metadataService.updateMetadata(objectKey, normalizedData);

      await this.ffmpegService.extractAndUploadScreenshots(localMp4Path, normalizedData.map(d => d.timeCode), tempDir, baseKeyPath);
    } catch (error) {
      this.logger.error(`ERROR: Exception during MP4 stella processing:`, error);
      await updateProcessingStatus(this.logger, objectKey, 'failed');
      return false;
    } finally {
      await updateProcessingStatus(this.logger, objectKey, 'processed');
      if (tempDir) {
        await fileCleanup(this.logger, tempDir, objectKey);
      }
    }

    return true;
  }

  async parseAndSaveData(objectKey: string, filePath: string) {
    try {
      const normalizedData = await this.parseService.parseData(filePath);
  
     
    } catch (error) {
      this.logger.error(`ERROR: Exception during MP4 stella processing:`, error);
      await updateProcessingStatus(this.logger, objectKey, 'failed');
      return false;
    }
  }

  async uploadResult(objectKey: string, tempDir: string, baseKeyPath: string) {
    const odometryKeyPath = baseKeyPath + '/' + STELLA_VS_LAM_OUTPUT_DIR;

    const outputDBPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_DB_FILE);
    const outputFrameTrajectoryPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE);
    const outputKeyframeTrajectoryPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE);
    const outputTrackTimesPath = path.join(tempDir, STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE);

    await this.s3Service.uploadFile(outputDBPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_DB_FILE}`);
    await this.s3Service.uploadFile(outputFrameTrajectoryPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_FRAME_TRAJECTORY_FILE}`);
    await this.s3Service.uploadFile(outputKeyframeTrajectoryPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_KEYFRAME_TRAJECTORY_FILE}`);
    await this.s3Service.uploadFile(outputTrackTimesPath, `${odometryKeyPath}/${STELLA_VS_LAM_OUTPUT_TRACK_TIMES_FILE}`);
  }
}