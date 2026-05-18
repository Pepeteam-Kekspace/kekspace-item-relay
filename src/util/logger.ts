type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, extra?: Record<string, unknown>): void {
    this.log("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.log("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.log("warn", message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.log("error", message, extra);
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`);
  }

  private log(
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ): void {
    const payload = {
      ts: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...extra,
    };
    const rendered = JSON.stringify(payload);
    if (level === "warn" || level === "error") {
      console.error(rendered);
      return;
    }
    console.log(rendered);
  }
}
