import { 
  ReceiveMessageCommand, 
  DeleteMessageCommand 
} from '@aws-sdk/client-sqs';
import { sqsClient } from './utils/aws-clients.js';
import { setupLogger } from './utils/logger.js';
import { StellaProcessor } from './services/stella-processor.js';
import { setAutoScalingDesiredCapacity } from './utils/aws-autoscaling.js';
import { RetryTracker } from './lib/retry-tracker.js';
import { updateProcessingStatus } from './lib/status-updater.js';
import { printRetryStats } from './utils/retry-stats.js';
import type { Logger } from './utils/logger.js';

type S3Record = {
  eventSource: string;
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
};

type S3Event = {
  Records: S3Record[];
};

type DirectMessage = {
  bucket: string;
  object_key: string;
};

export class SQSWorker {
  private readonly queueUrl: string;
  private readonly logger: Logger;
  private readonly stellaProcessor: StellaProcessor;
  private readonly retryTracker: RetryTracker;
  private readonly MAX_EMPTY_POLLS = 10;
  private readonly ALLOW_TURN_OFF = process.env.ALLOW_TURN_OFF !== 'false';

  private isRunning = false;
  private emptyPollCount = 0;

  constructor() {
    this.queueUrl = process.env.SQS_QUEUE_URL || '';
    this.logger = setupLogger();
    this.stellaProcessor = new StellaProcessor(this.logger);
    this.retryTracker = new RetryTracker(this.logger, 3);
  }

  private async stopInstance(): Promise<void> {
    try {
      await setAutoScalingDesiredCapacity(0, this.logger);
    } catch (error) {
      this.logger.error('Failed to update Auto Scaling group:', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('SQS worker is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting SQS worker to poll for INSV file messages from ${this.queueUrl}`);
    
    // Print retry statistics on startup
    printRetryStats();
    
    // Clean up old retry records on startup
    this.retryTracker.cleanupOldRecords();
    
    let pollCount = 0;
    
    while (this.isRunning) {
      try {
        this.emptyPollCount++;
        pollCount++;
        
        this.logger.info(`Polling for messages from SQS. Empty poll count: ${this.emptyPollCount}`);
        await this.pollMessages();
        
        // Clean up old retry records and print stats every 100 polls (approximately every 100 seconds)
        if (pollCount % 100 === 0) {
          this.retryTracker.cleanupOldRecords();
          this.logger.info('--- Periodic Retry Statistics ---');
          printRetryStats();
        }
      } catch (error) {
        this.logger.error('Error in SQS worker main loop:', error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  stop(): void {
    this.logger.info('Stopping SQS worker');
    this.isRunning = false;
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      }));
      this.logger.debug('Successfully processed and deleted message from SQS');
    } catch (error) {
      this.logger.error('Error deleting message from SQS:', error);
    }
  }

  private async processMp4File(objectKey: string, bucket: string): Promise<boolean> {
    if (!objectKey.toLowerCase().endsWith('.mp4')) {
      this.logger.debug(`Skipping non-MP4 file: ${objectKey}`);
      return true;
    }

    // Check if this file has exceeded max retries
    if (this.retryTracker.hasExceededMaxRetries(objectKey)) {
      this.logger.error(`File ${objectKey} has exceeded maximum retry attempts. Setting status to failTooMuchRetry`);
      await updateProcessingStatus(this.logger, objectKey, 'failTooMuchRetry');
      return true; // Consider this "successful" to remove from queue
    }

    // Increment retry count before processing
    const currentRetryCount = this.retryTracker.incrementRetryCount(objectKey);
    this.logger.info(`Processing MP4 file: ${objectKey} from bucket ${bucket} (attempt ${currentRetryCount}/3)`);

    try {
      const result = await this.stellaProcessor.processMp4File(objectKey);
      
      if (result) {
        // Processing succeeded, remove retry record
        this.retryTracker.removeRetryRecord(objectKey);
        return true;
      } else {
        // Processing failed
        if (this.retryTracker.hasExceededMaxRetries(objectKey)) {
          this.logger.error(`File ${objectKey} failed and exceeded maximum retry attempts. Setting status to failTooMuchRetry`);
          await updateProcessingStatus(this.logger, objectKey, 'failTooMuchRetry');
          return true; // Remove from queue
        }
        
        this.logger.warn(`Processing failed for ${objectKey}. Will retry (attempt ${currentRetryCount}/3)`);
        return false; // Let SQS retry
      }
    } catch (error) {
      this.logger.error(`Error processing ${objectKey}:`, error);
      
      if (this.retryTracker.hasExceededMaxRetries(objectKey)) {
        this.logger.error(`File ${objectKey} errored and exceeded maximum retry attempts. Setting status to failTooMuchRetry`);
        await updateProcessingStatus(this.logger, objectKey, 'failTooMuchRetry');
        return true; // Remove from queue
      }
      
      this.logger.warn(`Processing errored for ${objectKey}. Will retry (attempt ${currentRetryCount}/3)`);
      return false; // Let SQS retry
    }
  }

  private async handleS3Event(event: S3Event): Promise<boolean> {
    for (const record of event.Records) {
      if (record.eventSource === 'aws:s3' && record.eventName.startsWith('ObjectCreated')) {
        const key = decodeURIComponent(record.s3.object.key);
        const bucket = record.s3.bucket.name;
        return await this.processMp4File(key, bucket);
      }
    }
    return true;
  }

  private async handleDirectMessage(message: DirectMessage): Promise<boolean> {
    if (!message.bucket || !message.object_key) {
      this.logger.debug(`Skipping incomplete message: ${JSON.stringify(message)}`);
      return true;
    }
    return await this.processMp4File(message.object_key, message.bucket);
  }

  private async pollMessages(): Promise<void> {
    try {
      const response = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
      }));

      const messages = response.Messages || [];
      
      if (messages.length === 0) {
        this.logger.debug(`No messages received from SQS at this poll cycle. Empty poll count: ${this.emptyPollCount}`);
        
        if (this.emptyPollCount >= this.MAX_EMPTY_POLLS && this.ALLOW_TURN_OFF) {
          this.logger.info(`No messages received for ${this.MAX_EMPTY_POLLS} consecutive polls. Stopping instance...`);
          await this.stopInstance();
        }
        return;
      }
      
      this.emptyPollCount = 0;
      this.logger.info(`Received ${messages.length} messages from SQS`);
      
      for (const message of messages) {
        if (!message.Body || !message.ReceiptHandle) {
          this.logger.warn('Received message with no body or receipt handle');
          continue;
        }

        try {
          const job = JSON.parse(message.Body);
          const success = 'Records' in job ? 
            await this.handleS3Event(job) : 
            await this.handleDirectMessage(job);

            if (success) {
            this.logger.info(`Processing completed successfully for job: ${JSON.stringify(job)}`);
            await this.deleteMessage(message.ReceiptHandle);
          } else {
            this.logger.warn('Processing failed, message will return to queue for retry');
          }
        } catch (error) {
          this.logger.error('Error processing message:', error);
        }
      }
    } catch (error) {
      this.logger.error('Error polling SQS:', error);
      throw error;
    }
  }
}