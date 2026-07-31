export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;
}

export function createConsoleLogger(service: string): Logger {
  function write(event: LogEvent): void {
    const payload = {
      timestamp: new Date().toISOString(),
      service,
      level: event.level,
      message: event.message,
      context: event.context ?? {},
      error: event.error
        ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack
          }
        : undefined
    };

    const line = JSON.stringify(payload);
    if (event.level === "error") {
      console.error(line);
      return;
    }
    if (event.level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  }

  function event(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEvent {
    return {
      level,
      message,
      ...(context ? { context } : {}),
      ...(error ? { error } : {})
    };
  }

  return {
    debug: (message, context) => write(event("debug", message, context)),
    info: (message, context) => write(event("info", message, context)),
    warn: (message, context) => write(event("warn", message, context)),
    error: (message, context, error) => write(event("error", message, context, error))
  };
}

export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
