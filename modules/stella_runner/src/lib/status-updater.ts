import type { Logger } from '../utils/logger';

export type InsvStatus =
  | 'pending'
  | 'in_progress'
  | 'parsing_insv'
  | 'parsing_slam'
  | 'parsing_gps'
  | 'processed'
  | 'failed'
  | 'failTooMuchRetry';

export async function updateProcessingStatus(
  logger: Logger,
  objectKey: string,
  status: InsvStatus
): Promise<void> {
  if (!process.env.BIMEFY_SERVER_URL || !process.env.INSV_META_SECRET) {
    logger.warn('BIMEFY_SERVER_URL or INSV_META_SECRET is not set, skipping metadata request');

    console.log(process.env);
    return;
  }

  const inputUrls = JSON.parse(process.env.BIMEFY_SERVER_URL || '[]');

  const body = { object_key: objectKey, status };
  const serverUrls = Array.isArray(inputUrls)
    ? inputUrls
    : [inputUrls];

  for (const serverUrl of serverUrls) {
    try {
      const response = await fetch(`${serverUrl}/api/insv/status`, {
        method: 'POST',
        headers: {
          'x-insv-meta-secret': process.env.INSV_META_SECRET!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to update processing status for ${objectKey} on ${serverUrl}. Status: ${response.status}, Status Text: ${response.statusText}, Error: ${errorText}`);
      } else {
        logger.info(`Processing status updated for ${objectKey} on ${serverUrl} with status ${status}`);
      }
    } catch (error) {
      logger.error(`Error updating processing status for ${objectKey} on ${serverUrl}:`, error);
    }
  }
} 