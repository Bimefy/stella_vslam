import { config } from 'dotenv';
import { SQSWorker } from './sqs-worker';
import { setupLogger } from './utils/logger';
import { startSocketBridge } from './utils/socket-bridge';

console.log('Starting Stella Runner service...');

// Load environment variables
config();

// Setup logger
const logger = setupLogger();

// Validate required environment variables
const requiredEnvVars = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  "AWS_REGION",
  'S3_BUCKET_NAME',
  'SQS_QUEUE_URL'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

logger.info('Starting Stella Runner service...');

// Start SQS worker
const worker = new SQSWorker();
worker.start().catch(error => {
  logger.error('Fatal error in SQS worker:', error);
  process.exit(1);
});

// Start socket bridge (3000 -> 3003)
startSocketBridge(); 