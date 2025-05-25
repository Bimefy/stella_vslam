import { STELLA_VS_LAM_OUTPUT_DB_FILE } from '../constant';
import type { Logger } from '../utils/logger';
import { ProcessRunner } from '../utils/process-runner';
import type { ProcessOutputHandler } from '../utils/process-runner';

export class StellaRunner {
  private logger: Logger;
  private processRunner: ProcessRunner;

  constructor(logger: Logger) {
    this.logger = logger;
    this.processRunner = new ProcessRunner(logger);
  }

  async runStellaVSlamProcessing(objectKey: string, outputDir: string) {
    this.logger.info(`------------- Running Stella VSlam Processing for ${objectKey} -------------`);

    try {
      const result = await this.startStellaVSlamProcessing(objectKey, outputDir);
      this.logger.info(`------------- Stella VSlam Processing completed for ${objectKey} -------------`);
      return result;
    } catch (error) {
      this.logger.error(`Stella VSlam Processing failed:`, error);
      throw error;
    }
  }

  private async startStellaVSlamProcessing(objectKey: string, outputDir: string) {
    await this.setupOrbVocalFBow();

    const command = `/stella_vslam_examples/build/run_video_slam`;
    const args = [
      '-v', '/stella_vslam_examples/build/orb_vocab.fbow',
      '-m', objectKey,
      '-c', '/stella_vslam_examples/content/config.yml',
      // '--no-sleep',
      '--start-timestamp', '0',
      '--eval-log-dir', outputDir,
      '-o', `${outputDir}/${STELLA_VS_LAM_OUTPUT_DB_FILE}`,
      // '--temporal-mapping',
      // '--wait-loop-ba',
      '--auto-term',
    ];
    let isCancelled = false;
    let relocalizationTimeout: Timer | null = null;
    let trackingLostTime: number | null = null;

    const onOutput: ProcessOutputHandler = (data) => {
      // Handle critical errors that require cancellation
      const criticalErrors = {
        'Unable to open the video': 'Video file could not be opened',
        'Illegal instruction': 'Process encountered illegal instruction'
      };
      const terminateOnErrors = [
        'tracking lost: frame',
      ];
      const relocalizationSuccess = [
        'relocalization succeeded',
      ];
      const resetTracking = [
        'resetting system',
      ];

      for (const [errorText, errorMessage] of Object.entries(criticalErrors)) {
        if (data.text.includes(errorText)) {
          this.cancelProcessing();
          isCancelled = true;
          this.logger.error(errorMessage);
          return;
        }
      }

      if (terminateOnErrors.some(errorText => data.text.includes(errorText))) {
        if (!trackingLostTime) {
          trackingLostTime = Date.now();
          this.logger.error('$$$$$$$$$$$$$$$$$$$Tracking lost$$$$$$$$$$$$$$$$$$$$$$$', data.label, data.text);
          this.logger.info('Waiting 300 seconds for possible relocalization...');
          
          relocalizationTimeout = setTimeout(() => {
            this.logger.error('No relocalization detected within 30 seconds, terminating...');
            this.terminateProcessing();
            isCancelled = true;
          }, 300000);
        }
      }

      if (relocalizationTimeout && relocalizationSuccess.some(text => data.text.includes(text))) {
        clearTimeout(relocalizationTimeout);
        relocalizationTimeout = null;
        trackingLostTime = null;
        this.logger.info('Relocalization succeeded! Continuing processing...');
      }

      if (relocalizationTimeout && resetTracking.some(text => data.text.includes(text))) {
        this.logger.info('Tracking reset! Continuing processing...');
        clearTimeout(relocalizationTimeout);
        relocalizationTimeout = null;
        trackingLostTime = null;
      }

      // Log errors and standard output appropriately
      if (data.label === 'stderr') {
        this.logger.error(data.text);
        return;
      }

      this.logger.info(data.text);
    };

    this.logger.info(`Running Stella VSlam Processing for ${objectKey} starting at ${new Date().toISOString()}`);
    
    await this.runDockerStellaVSlamProcessing(command, args, onOutput);
    
    this.logger.info(`Stella VSlam Processing for ${objectKey} completed at ${new Date().toISOString()}`);

    if (!isCancelled) {
      this.logger.info('---------------------------------Processing completed successfully---------------------------------');
    } else {
      this.logger.error('Processing cancelled');
    }
  }

  private async setupOrbVocalFBow() {
    const checkCommand = `if [ ! -f "/stella_vslam_examples/build/orb_vocab.fbow" ]; then curl -sL "https://github.com/stella-cv/FBoW_orb_vocab/raw/main/orb_vocab.fbow" -o /stella_vslam_examples/build/orb_vocab.fbow; fi`;
    await this.processRunner.run('docker', ['exec', 'stella-vslam', 'sh', '-c', checkCommand], { logger: this.logger });
  }

  private async runDockerStellaVSlamProcessing(command: string, args: string[], onOutput: ProcessOutputHandler) {
    await this.processRunner.run('docker', ['exec', 'stella-vslam', 'sh', '-c', `${command} ${args.join(' ')}`], {
      logger: this.logger,
      onOutput,
    });
  }

  async cancelProcessing() {
    this.logger.info('Cancelling Stella VSlam Processing...');
    this.processRunner.cancel();
  }

  async terminateProcessing() {
    try {
      this.logger.info('Terminating Stella VSlam Processing...');
      fetch('http://localhost:3001/terminate');
    } catch (err) {
      this.logger.error('Failed to emit terminate signal to socket.io', err);
      this.cancelProcessing();
    }
  }
}