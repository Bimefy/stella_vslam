import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Logger } from '../utils/logger';
import { S3Service } from './s3-service';
import { updateProcessingStatus } from '../lib/status-updater';
import { fileCleanup } from '../lib/file-cleanup';

export class StellaRunner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async runStellaVSlamProcessing(objectKey: string) {
    this.logger.info(`------------- Running Stella VSlam Processing for ${objectKey} -------------`);

    const result = await this.startStellaVSlamProcessing(objectKey);
    
    this.logger.info(`------------- Stella VSlam Processing completed for ${objectKey} -------------`);

    // COPY the content of keyframes folder to s3
    return result;
  }

  private async startStellaVSlamProcessing(objectKey: string) {
    await this.setupOrbVocalFBow();
    const command = `/stella_vslam_examples/build/run_video_slam -v /stella_vslam_examples/build/orb_vocab.fbow -m ${objectKey} -c /stella_vslam_examples/content/config.yml --no-sleep --eval-log-dir /stella_vslam_examples/result --temporal-mapping --wait-loop-ba --no-sleep --auto-term`;
    return await this.runDockerStellaVSlamProcessing([command]);
  }

  private async setupOrbVocalFBow() {
    const checkCommand = `if [ ! -f "/stella_vslam_examples/build/orb_vocab.fbow" ]; then curl -sL "https://github.com/stella-cv/FBoW_orb_vocab/raw/main/orb_vocab.fbow" -o /stella_vslam_examples/build/orb_vocab.fbow; fi`;

    return await this.executeCommand('docker', ['exec', 'stella-vslam', 'sh', '-c', checkCommand]);
  }

  private async runDockerStellaVSlamProcessing(args: string[]) {
    return await this.executeCommand('docker', ['exec', 'stella-vslam', 'sh', '-c', ...args]);
  }

  private executeCommand(command: string, args: string[], outputFile?: string) {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Executing command: ${command} ${args.join(' ')}`);
      
      try {
        console.log('command', [command, ...args]);
        const result = Bun.spawnSync([command, ...args], {
          stdout: outputFile ? "pipe" : "inherit",
          stderr: "inherit"
        });
        
        // Handle direct file writing if needed
        if (outputFile && result.stdout) {
          Bun.write(outputFile, result.stdout);
        }
        
        // Check exit code
        if (result.exitCode === 0) {
          this.logger.debug(`Command completed successfully`);
          resolve(result.stdout);
        } else {
          const errorMsg = `Command failed with code ${result.exitCode}`;
          this.logger.error(errorMsg);
          reject(new Error(errorMsg));
        }
      } catch (error) {
        this.logger.error(`Failed to execute command:`, error);
        reject(error);
      }
    });
  }
}