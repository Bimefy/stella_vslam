/**
 * Simple logger utility
 */
export type Logger = {
  info: (message: string | object, ...args: any[]) => void;
  error: (message: string | object, ...args: any[]) => void;
  debug: (message: string | object, ...args: any[]) => void;
  warn: (message: string | object, ...args: any[]) => void;
}

/**
 * Setup and return a logger instance
 * @param options Optional configuration for the logger
 * @returns A Logger instance
 */
export function setupLogger(options?: { 
  level?: 'debug' | 'info' | 'warn' | 'error',
  prefix?: string
}): Logger {
  const logLevel = options?.level || 'info';
  const prefix = options?.prefix ? `[${options.prefix}] ` : '';
  const logLevels = { debug: 0, info: 1, warn: 2, error: 3 };

  return {
    info: (message: string | object, ...args: any[]) => {
      console.log(`[${new Date().toISOString()}] [INFO] ${prefix}${message}`, ...args);
    },
    warn: (message: string | object, ...args: any[]) => {
      console.log(`[${new Date().toISOString()}] [WARN] ${prefix}${message}`, ...args);
    },
    error: (message: string | object, ...args: any[]) => {
      console.log(`[${new Date().toISOString()}] [ERROR] ${prefix}${message}`, ...args);
    },
    debug: (message: string | object, ...args: any[]) => {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${prefix}${message}`, ...args);
    }
  };
}
