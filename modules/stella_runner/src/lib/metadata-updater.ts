import fs from 'fs';
import type { Logger } from '../utils/logger';
import { updateProcessingStatus } from './status-updater';

export async function updateMetadata(
  logger: Logger,
  objectKey: string,
  localInsvPath: string,
): Promise<void> {
  if (!process.env.BIMEFY_SERVER_URL || !process.env.INSV_META_SECRET) {
    logger.warn('BIMEFY_SERVER_URL or INSV_META_SECRET is not set, skipping metadata request');
    return;
  }

  const body = {
    object_key: objectKey,
    size: fs.statSync(localInsvPath).size,
    path: objectKey.split('/raw/')[0] || localInsvPath,
  };

  const inputUrls = JSON.parse(process.env.BIMEFY_SERVER_URL || '[]');

  const serverUrls = Array.isArray(inputUrls)
    ? inputUrls
    : [inputUrls];

  for (const serverUrl of serverUrls) {
    try {
      const response = await fetch(`${serverUrl}/api/insv/meta`, {
        method: 'POST',
        headers: {
          'x-insv-meta-secret': process.env.INSV_META_SECRET!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to update metadata for ${objectKey} on ${serverUrl}. Status: ${response.status}, Status Text: ${response.statusText}, Error: ${errorText}`);
      } else {
        logger.info(`Metadata updated for ${objectKey} on ${serverUrl}`);
      }
    } catch (error) {
      logger.error(`Error updating metadata for ${objectKey} on ${serverUrl}:`, error);
      await updateProcessingStatus(logger, objectKey, 'failed');
    }
  }
} 