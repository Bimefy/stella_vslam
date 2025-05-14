import { STELLA_VS_LAM_OUTPUT_DB_FILE } from '../constant';
import type { Logger } from '../utils/logger';
import { ProcessRunner } from '../utils/process-runner';
import type { ProcessOutputHandler } from '../utils/process-runner';

export class StellaRunner {
  private logger: Logger;
  private processRunner: ProcessRunner;

  constructor(logger: Logger) {
    this.logger = logger;
    this.processRunner = new ProcessRunner();
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
      '--no-sleep',
      '--start-timestamp', '0',
      '--eval-log-dir', outputDir,
      '-o', `${outputDir}/${STELLA_VS_LAM_OUTPUT_DB_FILE}`,
      '--temporal-mapping',
      '--wait-loop-ba',
      '--auto-term',
    ];

    let isCancelled = false;
    const onOutput: ProcessOutputHandler = (data) => {
      // Handle critical errors that require cancellation
      const criticalErrors = {
        'Unable to open the video': 'Video file could not be opened',
        'Illegal instruction': 'Process encountered illegal instruction'
      };

      for (const [errorText, errorMessage] of Object.entries(criticalErrors)) {
        if (data.text.includes(errorText)) {
          this.cancelProcessing();
          isCancelled = true;
          this.logger.error(errorMessage);
          return;
        }
      }

      // Log errors and standard output appropriately
      if (data.label === 'stderr') {
        this.logger.error(data.text);
        return;
      }

      this.logger.info(data.text);
    };

    await this.runDockerStellaVSlamProcessing(command, args, onOutput);

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
    this.processRunner.cancel(this.logger);
  }
}