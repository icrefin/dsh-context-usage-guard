/**
 * The one rule this plugin enforces on a model-call chunk stream.
 *
 * ## Why this exists
 *
 * The composer's context-usage ring is fed by the session projection
 * `contextPressure`, whose newest usage sample supplies the numerator:
 *
 * ```text
 * projectedTokens = max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens)
 * pressureTokens  = usage.inputTokens + cacheRead + cacheWrite   // prompt side
 * ```
 *
 * A model call that fails before the provider reports anything still ends its
 * stream with a `usage` chunk of zeros, because the adapter's accumulator
 * starts at zero and nothing overwrote it:
 *
 * ```text
 * chunk  usage   { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
 * chunk  finish  { kind: 'error', failure: { code: 'RATE_LIMIT' } }
 * ```
 *
 * That empty sample is the newest sample, so `pressureTokens` becomes 0 and,
 * because the sample is stamped at the current surface total, the projection
 * publishes `projectedTokens: 0`. The ring falls to 0% for as long as the
 * retry sequence lasts, which misreports a context that did not change.
 *
 * ## The rule
 *
 * A sample whose every reported count is zero measures nothing: no provider
 * said the prompt was empty. When such a sample belongs to an attempt that
 * ended in `error` or `aborted`, this filter drops it, so the previous real
 * reading stands. Everything else passes through untouched, including:
 *
 * - a successful completion, whatever it reports — `stop`, `tool-calls` and
 *   `max-tokens` are authoritative provider answers, so a zero there is left
 *   for the consumer to judge;
 * - a failed attempt that *did* report something (a partial call can carry real
 *   input counts), so no billed counter is ever discarded.
 *
 * The dropped chunk is optional in the stream protocol: `usage` may appear at
 * most once and is never required, `BlockAssembler.usage` stays `undefined`
 * without it, and the agent loop omits the durable event's `usage` field rather
 * than failing. Dropping it is therefore a legal stream, and it leaves token
 * accounting alone — the projection's usage fold adds the buckets of an empty
 * sample as zero anyway.
 *
 * @module dsh-context-usage-guard/guard
 */
/** Every count an empty sample can carry, so "all zero" is decided over the whole record. */
const USAGE_COUNTS = [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningTokens',
];
/**
 * Decide whether a usage sample carries no measurement at all.
 *
 * Every count the record holds must be zero or absent. A record with any
 * non-zero count is a real provider report — even a partial one — and is never
 * treated as empty.
 *
 * @param usage - the sample attached to a `usage` chunk.
 * @returns true when the sample reports nothing.
 */
export function isEmptySample(usage) {
    for (const key of USAGE_COUNTS) {
        const count = usage[key];
        if (count !== undefined && count !== 0)
            return false;
    }
    return true;
}
/**
 * Decide whether a terminal chunk reports a failed attempt.
 *
 * `error` covers provider and transport failures (the retry executor's
 * trigger); `aborted` covers a cancelled request. Both leave the context
 * unchanged, so neither may overwrite the last real reading.
 *
 * @param chunk - a chunk from the stream.
 * @returns true for a terminal failure finish.
 */
export function isFailureFinish(chunk) {
    if (chunk.type !== 'finish')
        return false;
    const kind = chunk.reason.kind;
    return kind === 'error' || kind === 'aborted';
}
/**
 * Wrap a chunk stream so an empty sample from a failed attempt never reaches
 * the consumer.
 *
 * The wrapper holds at most one `usage` chunk and releases it immediately
 * before the next chunk, so the only chunk whose position can change is the
 * sample that decides the outcome; visible deltas keep their order. A stream
 * that ends without its terminal `finish` still releases a held sample — the
 * guard never swallows information it did not positively decide to drop.
 *
 * @param source - the downstream chunk stream.
 * @param onHeld - called once per dropped sample, for diagnostics.
 * @returns the filtered chunk stream.
 */
export async function* guardEmptyFailureSamples(source, onHeld) {
    let pending;
    for await (const chunk of source) {
        if (chunk.type === 'usage') {
            // The grammar admits one sample per stream. A second one is another
            // producer's problem, so release the earlier sample instead of silently
            // swallowing it.
            if (pending !== undefined)
                yield pending;
            pending = chunk;
            continue;
        }
        if (pending !== undefined) {
            const held = chunk.type === 'finish' && isFailureFinish(chunk) && isEmptySample(pending.usage);
            if (held) {
                const code = chunk.type === 'finish' && chunk.reason.kind === 'error' ? chunk.reason.failure.code : undefined;
                onHeld?.(code === undefined ? { usage: pending.usage } : { usage: pending.usage, code });
            }
            else {
                yield pending;
            }
            pending = undefined;
        }
        yield chunk;
    }
    if (pending !== undefined)
        yield pending;
}
//# sourceMappingURL=guard.js.map