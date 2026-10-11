/**
 * Material recorded from a live DSH session, then sanitized.
 *
 * The failing attempt is the exact one that produced the reported symptom: a
 * provider route answered the request with HTTP 429 `token_capacity_exceeded`,
 * the adapter still closed the stream with a usage chunk of zeros, and
 * `@deepseek-ai/dsh-llm-retry` retried the same step six times before it
 * succeeded.
 *
 * What is faithful: the chunk sequence, the all-zero sample, the terminal
 * failure code, and every token count. What was replaced: the provider route,
 * the model id, the provider response id, the message / tool-call / tool-result
 * ids, the tool arguments, and the provider's error text — none of which the
 * folds under test read, and none of which belong in a published fixture. The
 * literals stay `String.raw` JSON so the shapes remain the real ones.
 *
 * @module dsh-context-usage-guard/test/recorded
 */

import type { AssistantStreamRecord, Message, TokenUsage } from '@deepseek-ai/dsh-llm'

/**
 * The failed attempt's durable stream: an all-zero usage sample followed by the
 * terminal error finish.
 */
export const FAILED_ATTEMPT_STREAM: readonly AssistantStreamRecord[] = JSON.parse(String.raw`[{"type":"chunk","time":1790867853136,"chunk":{"type":"usage","usage":{"inputTokens":0,"outputTokens":0,"totalTokens":0}}},{"type":"chunk","time":1790867853136,"chunk":{"type":"finish","reason":{"kind":"error","failure":{"message":"429: rate limit exceeded","code":"RATE_LIMIT"}}}}]`) as readonly AssistantStreamRecord[]

/** The provider usage of the last call that succeeded before the retry storm. */
export const SUCCESSFUL_USAGE: TokenUsage = JSON.parse(String.raw`{"inputTokens":645,"outputTokens":154,"totalTokens":64543,"cacheReadTokens":63744}`) as TokenUsage

/** The assistant message that carried {@link SUCCESSFUL_USAGE}. */
export const SUCCESSFUL_MESSAGE: Message = JSON.parse(String.raw`{"role":"assistant","content":[{"type":"tool-call","id":"call_example_0001","name":"bash","arguments":"{\"command\":\"ls\",\"description\":\"List files\"}"}],"source":{"kind":"model","provider":"example-provider","model":"example-model-v1","replayState":{"response":{"kind":"pi-ai","version":2,"api":"openai-completions","provider":"example-provider","model":"example-model-v1","responseId":"resp-example","stopReason":"toolUse"},"blocks":[{"type":"tool-call"}]}},"id":"00000000-0000-4000-8000-000000000001"}`) as Message

/** The tool result that grew the surface after that call, before the retry. */
export const TOOL_RESULT_MESSAGE: Message = JSON.parse(String.raw`{"role":"tool","source":{"kind":"tool","callId":"call_example_0001"},"toolCallId":"call_example_0001","content":[{"type":"text","text":"a.txt\nb.txt\n"}],"isError":false,"id":"00000000-0000-4000-8000-000000000002"}`) as Message

/** The usage the retried step finally reported, once a later attempt succeeded. */
export const RETRY_SUCCESS_USAGE: TokenUsage = JSON.parse(String.raw`{"inputTokens":1087,"outputTokens":117,"totalTokens":64692,"cacheReadTokens":63488}`) as TokenUsage