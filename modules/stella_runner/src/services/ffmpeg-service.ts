import path from 'node:path';
import fs from 'node:fs';
import type { Logger } from '../utils/logger.js';
import { ProcessRunner } from '../utils/process-runner.js';
import { ZipService } from './zip-service.js';
import { S3Service } from './s3-service.js';
import { SCREENSHOT_DIR, SCREENSHOT_ZIP_FILE } from '../constant.js';

export class FFmpegService {
  private logger: Logger;
  private processRunner: ProcessRunner;
  private s3Service: S3Service;
  private zipService: ZipService;

  constructor(logger: Logger) {
    this.logger = logger;
    this.processRunner = new ProcessRunner(logger);
    this.s3Service = new S3Service(logger);
    this.zipService = new ZipService(logger);
  }

  async extractScreenshots(videoPath: string, timeCodes: number[], outputDir: string) {
    try {
      console.log(`Extracting ${timeCodes.length} screenshots from video: ${videoPath}`);
      
      if (timeCodes.length === 0) {
        this.logger.warn('No timeCodes provided for screenshot extraction');
        return [];
      }

      const chunkSize = 3;

      fs.mkdirSync(outputDir, { recursive: true });
      
      const screenshotPaths = [];
      const chunkArray = (arr: any[], chunkSize: number) => 
        Array.from({ length: Math.ceil(arr.length / chunkSize) }, (_, i) =>
          arr.slice(i * chunkSize, (i + 1) * chunkSize)
        );

      for (const [chunkIndex, chunk] of chunkArray(timeCodes, chunkSize).entries()) {
        const chunkResults = await Promise.all(
          chunk.map((timestamp, i) => 
            this.extractSingleScreenshot(
              videoPath,
              timestamp,
              outputDir,
              chunkIndex * chunkSize + i,
              timeCodes.length
            )
          )
        );
        
        screenshotPaths.push(...chunkResults.flat());
      }

      const validScreenshots = screenshotPaths.filter(Boolean) as string[];
      console.log(`Successfully extracted ${validScreenshots.length} screenshots from ${timeCodes.length} timeCodes`);
      
      return validScreenshots;
    } catch (error) {
      this.logger.error(`Exception during screenshot extraction:`, error);
      return null;
    }
  }

  private async extractSingleScreenshot(
    videoPath: string,
    timeCode: number,
    outputDir: string,
    index: number,
    totalTimeCodes: number
  ) {
    if (!timeCode) {
      this.logger.warn(`Skipping undefined timestamp at index ${index}`);
      return [];
    }

    const resolutions = [
      { suffix: 'low', scale: 'scale=-1:1080:flags=lanczos' },
      { suffix: 'high', scale: 'scale=-1:3840:flags=lanczos' }
    ];

    const screenshotPaths = [];

    for (const res of resolutions) {
      const resDir = path.join(outputDir, `${SCREENSHOT_DIR}-${res.suffix}`);
      fs.mkdirSync(resDir, { recursive: true });

      const screenshotPath = path.join(resDir, `${index + 1}.webp`);

      try {
        console.log(`Extracting ${res.suffix} screenshot at ${timeCode} on ${totalTimeCodes}...`);
        await this.processRunner.executeCommandSync('ffmpeg', [
          '-accurate_seek',
          '-ss', timeCode.toString(),
          '-i', videoPath,
          '-frames:v', '1',
          '-vf', `${res.scale},format=yuv420p`,
          '-c:v', 'libwebp',
          '-quality', '95',
          '-compression_level', '6',
          '-preset', 'photo',
          '-color_range', '2',
          '-threads', '8',
          '-y',
          screenshotPath
        ]);

        if (fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 0) {
          console.log(`Screenshot ${index + 1} of ${totalTimeCodes} (${res.suffix}) extracted successfully`);
          screenshotPaths.push(screenshotPath);
        } else {
          this.logger.warn(`Failed to create ${res.suffix} screenshot at ${timeCode} on ${totalTimeCodes} - file is missing or empty`);
        }
      } catch (err) {
        this.logger.error(`Error extracting ${res.suffix} screenshot at ${timeCode} on ${totalTimeCodes}:`, err);
      }
    }

    return screenshotPaths;
  }

  async extractAndUploadScreenshots(mp4Path: string, timeCodes: number[], tempDir: string, baseS3Path: string) {
    const screenshotsDir = path.join(tempDir, SCREENSHOT_DIR);
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const screenshotPaths = await this.extractScreenshots(mp4Path, timeCodes, screenshotsDir);
    if (!screenshotPaths?.length) {
      this.logger.warn('No screenshots were extracted from the MP4 file');
      return;
    }

    const validScreenshotPaths = this.validateScreenshotPaths(screenshotPaths);
    if (!validScreenshotPaths.length) {
      this.logger.error('No valid screenshot files found');
      return;
    }

    await this.uploadScreenshotsToS3(validScreenshotPaths, screenshotsDir, baseS3Path);
    await this.createAndUploadZipArchive(validScreenshotPaths, tempDir, baseS3Path);
  }

  private validateScreenshotPaths(paths: string[]): string[] {
    return paths.filter(path => {
      const exists = fs.existsSync(path);
      if (!exists) this.logger.warn(`Screenshot file not found: ${path}`);
      return exists;
    });
  }

  private async uploadScreenshotsToS3(
    validPaths: string[], 
    screenshotsDir: string, 
    baseS3Path: string
  ) {
    const resolutions = ['low', 'high'];
    
    for (const res of resolutions) {
      const resDir = path.join(screenshotsDir, `${SCREENSHOT_DIR}-${res}`);
      const s3ResKey = `${baseS3Path}/${SCREENSHOT_DIR}-${res}`;
      
      const metadata = {
        'content-type': 'image/webp',
        'total-screenshots': validPaths.filter(p => p.includes(SCREENSHOT_DIR + `-${res}`)).length.toString()
      };

      const screenshotUrls = await this.s3Service.uploadDirectory(resDir, s3ResKey, metadata);
      
      if (!screenshotUrls?.length) {
        this.logger.error(`Failed to upload ${res} resolution screenshots to S3`);
        continue;
      }

      this.logger.info(`Successfully uploaded ${screenshotUrls.length} ${res} resolution screenshots to S3 path: ${s3ResKey}`);
    }
  }

  private async createAndUploadZipArchive(
    validPaths: string[], 
    tempDir: string, 
    baseS3Path: string, 
  ) {
    const highResPaths = validPaths.filter(p => p.includes(SCREENSHOT_DIR + '-high'));
    
    if (!highResPaths.length) {
      this.logger.error('No high-resolution screenshots found for ZIP archive');
      return;
    }

    const zipPath = path.join(tempDir, SCREENSHOT_ZIP_FILE);
    const s3ZipKey = baseS3Path + '/' + SCREENSHOT_ZIP_FILE;

    this.logger.info('Creating ZIP archive for high-resolution screenshots...');
    const createdZipPath = await this.zipService.createZipArchive(highResPaths, zipPath);
    
    if (!createdZipPath || !fs.statSync(createdZipPath).size) {
      this.logger.error('Failed to create valid ZIP archive');
      return;
    }

    const metadata = {
      'content-type': 'application/zip',
      'screenshot-count': highResPaths.length.toString()
    };

    try {
      const zipUrl = await this.s3Service.uploadFile(zipPath, s3ZipKey, metadata);
      if (zipUrl) {
        this.logger.info(`Uploaded high-resolution screenshots ZIP to ${s3ZipKey}`);
      }
    } catch (error) {
      this.logger.error('Failed to upload ZIP file to S3:', error);
    }
  }
}
