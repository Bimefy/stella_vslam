import fs from 'fs';
import path from 'path';
import type { Logger } from '../utils/logger';

export interface RetryRecord {
  objectKey: string;
  retryCount: number;
  lastAttempt: string;
}

export interface RetryData {
  [objectKey: string]: RetryRecord;
}

export class RetryTracker {
  private readonly retryFilePath: string;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(logger: Logger, maxRetries: number = 3) {
    this.logger = logger;
    this.maxRetries = maxRetries;
    this.retryFilePath = path.join('/tmp', 'stella-retry-tracker.json');
    this.ensureRetryFileExists();
  }

  private ensureRetryFileExists(): void {
    try {
      if (!fs.existsSync(this.retryFilePath)) {
        fs.writeFileSync(this.retryFilePath, JSON.stringify({}));
        this.logger.info(`Created retry tracking file at ${this.retryFilePath}`);
      }
    } catch (error) {
      this.logger.error('Failed to create retry tracking file:', error);
    }
  }

  private readRetryData(): RetryData {
    try {
      const data = fs.readFileSync(this.retryFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.error('Failed to read retry data, returning empty object:', error);
      return {};
    }
  }

  private writeRetryData(data: RetryData): void {
    try {
      fs.writeFileSync(this.retryFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error('Failed to write retry data:', error);
    }
  }

  getRetryCount(objectKey: string): number {
    const retryData = this.readRetryData();
    return retryData[objectKey]?.retryCount || 0;
  }

  incrementRetryCount(objectKey: string): number {
    const retryData = this.readRetryData();
    const currentRecord = retryData[objectKey];
    
    const newRetryCount = (currentRecord?.retryCount || 0) + 1;
    
    retryData[objectKey] = {
      objectKey,
      retryCount: newRetryCount,
      lastAttempt: new Date().toISOString()
    };

    this.writeRetryData(retryData);
    
    this.logger.info(`Incremented retry count for ${objectKey} to ${newRetryCount}`);
    return newRetryCount;
  }

  shouldRetry(objectKey: string): boolean {
    const retryCount = this.getRetryCount(objectKey);
    const shouldRetry = retryCount < this.maxRetries;
    
    this.logger.info(`Retry check for ${objectKey}: count=${retryCount}, maxRetries=${this.maxRetries}, shouldRetry=${shouldRetry}`);
    
    return shouldRetry;
  }

  hasExceededMaxRetries(objectKey: string): boolean {
    const retryCount = this.getRetryCount(objectKey);
    return retryCount >= this.maxRetries;
  }

  removeRetryRecord(objectKey: string): void {
    const retryData = this.readRetryData();
    delete retryData[objectKey];
    this.writeRetryData(retryData);
    this.logger.info(`Removed retry record for ${objectKey}`);
  }

  cleanupOldRecords(olderThanDays: number = 7): void {
    const retryData = this.readRetryData();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;
    for (const [key, record] of Object.entries(retryData)) {
      const recordDate = new Date(record.lastAttempt);
      if (recordDate < cutoffDate) {
        delete retryData[key];
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.writeRetryData(retryData);
      this.logger.info(`Cleaned up ${cleanedCount} old retry records`);
    }
  }
} 