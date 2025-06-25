#!/usr/bin/env bun

import { RetryTracker } from './lib/retry-tracker.js';
import { setupLogger } from './utils/logger.js';
import { updateProcessingStatus } from './lib/status-updater.js';
import { printRetryStats } from './utils/retry-stats.js';

const logger = setupLogger();
const retryTracker = new RetryTracker(logger, 3);

async function testRetryTracking() {
  console.log('=== Testing Retry Tracking System ===\n');
  
  const testFile = 'test/sample-video.mp4';
  
  console.log(`Testing retry tracking for file: ${testFile}`);
  
  // Test initial state
  console.log(`Initial retry count: ${retryTracker.getRetryCount(testFile)}`);
  console.log(`Should retry: ${retryTracker.shouldRetry(testFile)}`);
  console.log(`Has exceeded max retries: ${retryTracker.hasExceededMaxRetries(testFile)}\n`);
  
  // Simulate failed attempts
  for (let i = 1; i <= 4; i++) {
    console.log(`--- Attempt ${i} ---`);
    
    if (!retryTracker.shouldRetry(testFile)) {
      console.log(`❌ Should not retry ${testFile} - exceeded max attempts`);
      await updateProcessingStatus(logger, testFile, 'failTooMuchRetry');
      break;
    }
    
    const currentCount = retryTracker.incrementRetryCount(testFile);
    console.log(`Incremented retry count to: ${currentCount}`);
    
    // Simulate processing failure
    console.log(`Processing ${testFile}... ❌ FAILED`);
    
    if (retryTracker.hasExceededMaxRetries(testFile)) {
      console.log(`🚫 Max retries exceeded for ${testFile}`);
      await updateProcessingStatus(logger, testFile, 'failTooMuchRetry');
      break;
    }
    
    console.log(`Will retry later...\n`);
  }
  
  // Show final statistics
  console.log('=== Final Statistics ===');
  printRetryStats();
  
  // Clean up test data
  retryTracker.removeRetryRecord(testFile);
  console.log(`Cleaned up test data for ${testFile}`);
}

// Run the test
testRetryTracking().catch(console.error); 