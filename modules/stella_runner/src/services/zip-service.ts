import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import type { Logger } from '../utils/logger.js';

export class ZipService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Validate a file before adding it to the ZIP archive
   * @param filePath Path to the file to validate
   * @returns Boolean indicating if the file is valid
   */
  private isValidFile(filePath: string): boolean {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`File does not exist: ${filePath}`);
        return false;
      }
      
      // Check if file has content
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        this.logger.warn(`File is empty: ${filePath}`);
        return false;
      }
      
      // Check if file is readable
      fs.accessSync(filePath, fs.constants.R_OK);
      
      // File passed all checks
      return true;
    } catch (error) {
      this.logger.error(`Error validating file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Create a ZIP archive containing the specified files
   * @param files Array of file paths to include in the ZIP archive
   * @param outputPath Path to the output ZIP file
   * @returns Promise that resolves to the output path, or null if failed
   */
  async createZipArchive(files: string[], outputPath: string): Promise<string | null> {
    try {
      this.logger.debug(`Creating ZIP archive with ${files.length} files at ${outputPath}`);
      
      // Ensure the output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Filter out invalid files
      const validFiles = files.filter(file => this.isValidFile(file));
      
      if (validFiles.length === 0) {
        this.logger.error('No valid files to add to ZIP archive');
        return null;
      }
      
      this.logger.debug(`Found ${validFiles.length} valid files to add to ZIP archive`);
      
      // Create a file to stream archive data to
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 6 }, // Medium compression level for better compatibility
        store: false // Use compression (not just store)
      });
      
      // Create a promise that resolves when the output stream closes
      const closePromise = new Promise<void>((resolve, reject) => {
        output.on('close', () => {
          this.logger.debug(`ZIP archive created successfully: ${outputPath} (${archive.pointer()} bytes)`);
          resolve();
        });
        
        output.on('error', (err) => {
          this.logger.error(`Error in output stream:`, err);
          reject(err);
        });
        
        archive.on('error', (err) => {
          this.logger.error(`Error creating ZIP archive:`, err);
          reject(err);
        });
        
        archive.on('warning', (err) => {
          if (err.code === 'ENOENT') {
            this.logger.warn(`ZIP archive warning:`, err);
          } else {
            this.logger.error(`ZIP archive warning:`, err);
            reject(err);
          }
        });
      });
      
      // Pipe archive data to the file
      archive.pipe(output);
      
      // Add each file to the archive with generic sequential naming
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const fileExt = path.extname(file!);
        const genericName = `${i+1}${fileExt}`;
        archive.file(file!, { name: genericName });
        this.logger.debug(`Added file to ZIP as: ${genericName}`);
      }
      
      // Finalize the archive (but do not await yet)
      const finalizationPromise = archive.finalize();
      
      // Wait for both the finalization and the close event
      await Promise.all([finalizationPromise, closePromise]);
      
      this.logger.info(`ZIP archive finalized and closed: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Exception during ZIP archive creation:`, error);
      return null;
    }
  }
} 