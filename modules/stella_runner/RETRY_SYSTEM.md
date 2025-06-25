# Retry Tracking System

This document describes the retry tracking system implemented in the Stella Runner to prevent infinite retries and properly handle failed processing attempts.

## Overview

The retry tracking system monitors processing attempts for video files and implements a maximum retry limit of 3 attempts. When files exceed this limit, they are marked with a `failTooMuchRetry` status instead of continuing to retry indefinitely.

## Components

### 1. RetryTracker (`src/lib/retry-tracker.ts`)

The core component that manages retry counts using a local JSON file for persistence.

**Key Features:**
- Stores retry data in `/tmp/stella-retry-tracker.json`
- Tracks retry count and last attempt timestamp per file
- Provides methods to check, increment, and clean up retry records
- Configurable maximum retry limit (default: 3)

**Methods:**
- `getRetryCount(objectKey)` - Get current retry count for a file
- `incrementRetryCount(objectKey)` - Increment and return new retry count
- `shouldRetry(objectKey)` - Check if file should be retried
- `hasExceededMaxRetries(objectKey)` - Check if max retries exceeded
- `removeRetryRecord(objectKey)` - Remove retry record (on success)
- `cleanupOldRecords(days)` - Remove records older than specified days

### 2. Updated Status Types (`src/lib/status-updater.ts`)

Extended the `InsvStatus` type to include:
- `failTooMuchRetry` - For files that exceeded maximum retry attempts

### 3. Enhanced SQS Worker (`src/sqs-worker.ts`)

The SQS worker now integrates retry tracking:

**Processing Flow:**
1. Check if file has exceeded max retries → Set `failTooMuchRetry` status and remove from queue
2. Increment retry count before processing
3. Process the file
4. On success → Remove retry record and delete message from queue
5. On failure → Check if max retries exceeded → Set `failTooMuchRetry` status or let SQS retry

**Additional Features:**
- Periodic cleanup of old retry records (every 100 polls)
- Retry statistics logging on startup and periodically
- Enhanced logging with retry attempt numbers

### 4. Retry Statistics (`src/utils/retry-stats.ts`)

Utility functions to monitor retry system health:
- `getRetryStats()` - Get retry statistics
- `printRetryStats()` - Print formatted retry statistics

## Configuration

The retry system can be configured via:

```typescript
// Maximum retry attempts (default: 3)
const retryTracker = new RetryTracker(logger, 3);

// Cleanup interval for old records (default: 7 days)
retryTracker.cleanupOldRecords(7);
```

## Data Storage

Retry data is stored in `/tmp/stella-retry-tracker.json` with the following structure:

```json
{
  "path/to/video.mp4": {
    "objectKey": "path/to/video.mp4",
    "retryCount": 2,
    "lastAttempt": "2024-01-15T10:30:00.000Z"
  }
}
```

## Usage Examples

### Testing the Retry System

Run the test script to see the retry system in action:

```bash
bun run test-retry
```

### Monitoring Retry Statistics

The system automatically prints retry statistics:
- On worker startup
- Every 100 polling cycles
- Via the test script

Example output:
```
=== Retry Statistics ===
Total files with retry records: 5

Files by retry count:
  1 retry: 2 files
  2 retries: 2 files
  3 retries: 1 files

Oldest record: video1.mp4
Newest record: video5.mp4
========================
```

## Error Handling

The retry system handles various error scenarios:

1. **File system errors** - Gracefully handles read/write failures
2. **Corrupted retry data** - Falls back to empty state
3. **Missing retry file** - Creates new file automatically
4. **Processing failures** - Properly tracks and limits retries

## Integration with SQS

The system works seamlessly with AWS SQS:

- **Success cases**: Messages are deleted from queue, retry records removed
- **Failure cases**: Messages remain in queue for SQS retry (up to max attempts)
- **Max retries exceeded**: Messages are deleted from queue, status set to `failTooMuchRetry`

## Benefits

1. **Prevents infinite retry loops** - Hard limit on retry attempts
2. **Persistent retry tracking** - Survives service restarts
3. **Observable system** - Built-in statistics and logging
4. **Configurable limits** - Easy to adjust retry behavior
5. **Automatic cleanup** - Prevents storage bloat from old records
6. **SQS integration** - Works with existing message queue system 