import fs from 'fs';
import type { Logger } from '../utils/logger';
import { updateProcessingStatus } from './status-updater';

export async function fileCleanup(
  logger: Logger,
  tempDir: string,
  objectKey: string
): Promise<void> {
  try {
    const memUsage = process.memoryUsage();
    logger.info(`Memory usage after processing: ${JSON.stringify({
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
    })}`);

    fs.rmSync(tempDir, { recursive: true, force: true });
    logger.info(`Cleaned up temporary directory ${tempDir}`);
  } catch (error) {
    console.log('Error during cleanup:', error);
    logger.warn(`Failed to clean up temporary directory ${tempDir}:`, error);
    await updateProcessingStatus(logger, objectKey, 'failed');
  }
} 