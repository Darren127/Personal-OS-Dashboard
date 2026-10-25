import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
export type ModelMessage = Anthropic.Beta.Messages.BetaMessage;

export type ModelEvent =
  | { type: "text"; delta: string }
  /** Short progress notes the model writes between tool calls. */
  | { type: "progress"; delta: string }
  /** Partial output from a failed attempt should be discarded. */
  | { type: "retry" };

/**
 * Sends one request and streams it. Returns the complete message. The engine
 * depends on this signature rather than on the SDK, so tests can substitute a
 * scripted model without calling the API.
 */
export type Streamer = (params: StreamParams, emit: (e: ModelEvent) => void) => Promise<ModelMessage>;

export function anthropicStreamer(apiKey: string): Streamer {
  const client = new Anthropic({
    apiKey,
    // Use only this app's key: never pick up a bearer token or a different
    // API endpoint from the surrounding environment.
    authToken: null,
    baseURL: process.env.PERSONAL_OS_ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    maxRetries: 2,
  });

  return async (params, emit) => {
    for (let attempt = 0; ; attempt++) {
      const stream = client.beta.messages.stream(params);
      try {
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") emit({ type: "text", delta: event.delta.text });
          else if (event.delta.type === "thinking_delta" && event.delta.thinking) {
            emit({ type: "progress", delta: event.delta.thinking });
          }
        }
        return await stream.finalMessage();
      } catch (err) {
        // API errors (auth, rate limit, overload) are reported to the user.
        // Anything else here is a tool input the SDK couldn't parse at all:
        // re-issue the same request a limited number of times.
        if (err instanceof Anthropic.APIError || attempt >= 2) throw err;
        emit({ type: "retry" });
      }
    }
  };
}

/** A user-facing explanation for an API failure. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The Claude API key was rejected. Check ANTHROPIC_API_KEY in your environment settings.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "This API key isn't allowed to use the configured model. Check your Anthropic Console settings.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "The Claude API rate limit was reached. Wait a minute and try again.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `The Claude API rejected the request: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the Claude API. Check the server's internet connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return err.status && err.status >= 500
      ? "The Claude API is having trouble right now. Try again in a moment."
      : `Claude API error (${err.status ?? "unknown"}).`;
  }
  return "Something went wrong while talking to Claude.";
}
