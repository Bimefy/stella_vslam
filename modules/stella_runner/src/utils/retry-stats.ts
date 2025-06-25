import fs from 'fs';
import path from 'path';
import type { RetryData } from '../lib/retry-tracker';

export function getRetryStats(): {
  totalFiles: number;
  filesByRetryCount: Record<number, number>;
  oldestRecord: string | null;
  newestRecord: string | null;
} {
  const retryFilePath = path.join('/tmp', 'stella-retry-tracker.json');
  
  try {
    if (!fs.existsSync(retryFilePath)) {
      return {
        totalFiles: 0,
        filesByRetryCount: {},
        oldestRecord: null,
        newestRecord: null
      };
    }

    const data: RetryData = JSON.parse(fs.readFileSync(retryFilePath, 'utf8'));
    const records = Object.values(data);
    
    if (records.length === 0) {
      return {
        totalFiles: 0,
        filesByRetryCount: {},
        oldestRecord: null,
        newestRecord: null
      };
    }

    const filesByRetryCount: Record<number, number> = {};
    let oldestDate = new Date();
    let newestDate = new Date(0);
    let oldestRecord = '';
    let newestRecord = '';

    for (const record of records) {
      const retryCount = record.retryCount;
      filesByRetryCount[retryCount] = (filesByRetryCount[retryCount] || 0) + 1;
      
      const recordDate = new Date(record.lastAttempt);
      if (recordDate < oldestDate) {
        oldestDate = recordDate;
        oldestRecord = record.objectKey;
      }
      if (recordDate > newestDate) {
        newestDate = recordDate;
        newestRecord = record.objectKey;
      }
    }

    return {
      totalFiles: records.length,
      filesByRetryCount,
      oldestRecord,
      newestRecord
    };
  } catch (error) {
    console.error('Error reading retry stats:', error);
    return {
      totalFiles: 0,
      filesByRetryCount: {},
      oldestRecord: null,
      newestRecord: null
    };
  }
}

export function printRetryStats(): void {
  const stats = getRetryStats();
  
  console.log('\n=== Retry Statistics ===');
  console.log(`Total files with retry records: ${stats.totalFiles}`);
  
  if (stats.totalFiles > 0) {
    console.log('\nFiles by retry count:');
    for (const [retryCount, fileCount] of Object.entries(stats.filesByRetryCount)) {
      console.log(`  ${retryCount} ${retryCount === '1' ? 'retry' : 'retries'}: ${fileCount} files`);
    }
    
    console.log(`\nOldest record: ${stats.oldestRecord}`);
    console.log(`Newest record: ${stats.newestRecord}`);
  }
  
  console.log('========================\n');
} 