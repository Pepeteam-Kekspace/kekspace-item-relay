import type {SinkConfig} from "../types.js";

export class WebhookSinkError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WebhookSinkError";
  }
}

export class WebhookSinkClient {
  constructor(
    readonly sinkKey: string,
    private readonly config: SinkConfig,
  ) {}

  async push(payload: unknown): Promise<void> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.config.authToken) {
      headers[this.config.authHeader ?? "authorization"] =
        this.config.authHeader ? this.config.authToken : `Bearer ${this.config.authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(this.config.endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WebhookSinkError(
        `request failed before response: ${message}`,
        true,
      );
    }

    if (response.ok) {
      return;
    }

    const detail = await this.safeReadText(response);
    const suffix = detail.length > 0 ? `: ${detail}` : "";
    throw new WebhookSinkError(
      `webhook failed with status ${response.status}${suffix}`,
      response.status >= 500,
    );
  }

  private async safeReadText(response: Response): Promise<string> {
    try {
      return (await response.text()).trim();
    } catch {
      return "";
    }
  }
}
