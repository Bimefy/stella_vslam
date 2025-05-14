/**
 * Simple logger utility
 */
export interface Logger {
  info(message: string | object, ...args: any[]): void;
  error(message: string | object, ...args: any[]): void;
  debug(message: string | object, ...args: any[]): void;
  warn(message: string | object, ...args: any[]): void;
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
      if (logLevels[logLevel] <= logLevels.info) {
        createLog('info', message, prefix, ...args);
      }
    },
    warn: (message: string | object, ...args: any[]) => {
      if (logLevels[logLevel] <= logLevels.warn) {
        createLog('warn', message, prefix, ...args);
      }
    },
    error: (message: string | object, ...args: any[]) => {
      if (logLevels[logLevel] <= logLevels.error) {
        createLog('error', message, prefix, ...args);
      }
    },
    debug: (message: string | object, ...args: any[]) => {
      if (logLevels[logLevel] <= logLevels.debug) {
        createLog('debug', message, prefix, ...args);
      }
    }
  };
}

/**
 * Creates a formatted log entry
 * @param type Log level type
 * @param message Message or context object to log
 * @param prefix Optional prefix for the log
 * @param args Additional arguments to log
 */
export const createLog = (
  type: 'info' | 'error' | 'debug' | 'warn', 
  message: string | object, 
  prefix: string = '',
  ...args: any[]
) => {
  const timestamp = new Date().toISOString();
  
  if (typeof message === 'object' && message !== null) {
    // Handle context object pattern seen in the codebase
    if ('name' in message && typeof message.name === 'string') {
      const { name, ...context } = message as { name: string, [key: string]: any };
      console[type](
        `[${timestamp}] [${type.toUpperCase()}] ${prefix}${name}:`, 
        JSON.stringify(context), 
        ...args
      );
    } else {
      console[type](
        `[${timestamp}] [${type.toUpperCase()}] ${prefix}`, 
        JSON.stringify(message), 
        ...args
      );
    }
  } else {
    console[type](
      `[${timestamp}] [${type.toUpperCase()}] ${prefix}${message}`, 
      ...args
    );
  }
}