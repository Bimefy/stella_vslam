import type { Logger } from './logger';

export type ProcessOutputHandler = (data: { label: 'stdout' | 'stderr'; text: string }) => void;

export interface RunProcessOptions {
  logger?: Logger;
  onOutput?: ProcessOutputHandler;
  cwd?: string;
}

export class ProcessRunner {
  private currentProcess: ReturnType<typeof Bun.spawn> | null = null;

  async run(command: string, args: string[], options: RunProcessOptions = {}, outputFile?: string): Promise<number> {
    const { logger, onOutput, cwd } = options;
    logger?.debug(`Executing command: ${command} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      try {
        // @ts-ignore
        this.currentProcess = Bun.spawn([command, ...args], {
          stdout: 'pipe',
          stderr: 'pipe',
          cwd,
        }) as ReturnType<typeof Bun.spawn>;

        const readStream = async (stream: ReadableStream<Uint8Array>, label: 'stdout' | 'stderr') => {
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            onOutput?.({ label, text });
          }
        };

        readStream(this.currentProcess.stdout!, 'stdout');
        readStream(this.currentProcess.stderr!, 'stderr');

        // @ts-ignore
        if (outputFile && this.currentProcess.stdout!) {
          // @ts-ignore
          Bun.write(outputFile, this.currentProcess.stdout);
        }

        this.currentProcess.exited.then((code: number) => {
          logger?.debug(`Process exited with code ${code}`);
          this.currentProcess = null;
          resolve(code);
        });
      } catch (error) {
        this.currentProcess = null;
        logger?.error('Failed to execute command:', error);
        reject(error);
      }
    });
  }

  cancel(logger?: Logger) {
    if (this.currentProcess) {
      logger?.info('Canceling current process...');
      try {
        this.currentProcess.kill();
        this.currentProcess = null;
        logger?.info('Process canceled successfully');
      } catch (error) {
        logger?.error('Failed to cancel process:', error);
        throw error;
      }
    } else {
      logger?.warn('No active process to cancel');
    }
  }
} 