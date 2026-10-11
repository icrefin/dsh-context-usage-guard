/**
 * dsh-context-usage-guard — host half.
 *
 * Keeps the composer's context-usage ring from collapsing to 0% while a model
 * request is being retried.
 *
 * The ring renders `contextPressure`, the session projection that takes the
 * newest provider usage sample as the current prompt size. A failed attempt
 * still ends its stream with a `usage` chunk of zeros, because the adapter's
 * accumulator starts at zero and nothing overwrote it, so that empty sample
 * becomes "the newest sample" and the ring reports 0% until the retried request
 * finally succeeds.
 *
 * This plugin sits on the LlmRuntime's documented `llm/stream` waterfall and
 * removes exactly that sample, so the projection keeps the last real reading.
 * See `guard.ts` for the rule and why dropping the chunk is legal.
 *
 * One registration, inside `ctx.effect`: cordis runs the disposer when the
 * plugin unloads, when the profile patch disables the row, or at shutdown. A
 * bare `ctx.on` outside an effect would leak the listener past unload.
 *
 * @module dsh-context-usage-guard
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Loader row id; also the settings namespace, because an entry's Config is its namespace. */
export declare const name = "dsh-context-usage-guard";
/** The waterfall belongs to the LLM service, so the service must exist first. */
export declare const inject: string[];
/**
 * The row's Config — and therefore this plugin's settings namespace.
 *
 * Both fields are `.volatile()`, making them writable at runtime: the Loader
 * updates the value in place on the running fiber, so the listener registered
 * in `apply()` reads the current setting with no reload.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    /** While off, every stream is passed through untouched. */
    enabled: z<boolean, boolean, "volatile-defined">;
    /** Log one host line per withheld sample: provider, model and failure code. */
    logHeldSamples: z<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    /** While off, every stream is passed through untouched. */
    enabled: z<boolean, boolean, "volatile-defined">;
    /** Log one host line per withheld sample: provider, model and failure code. */
    logHeldSamples: z<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/**
 * A volatile config field arrives as a live holder rather than a plain value;
 * a schema-less mount can also hand over the plain value directly.
 */
type Flag = boolean | {
    get(): unknown;
} | undefined;
/** Config as `apply` receives it: volatile holders, not plain booleans. */
export interface GuardConfig {
    enabled?: Flag;
    logHeldSamples?: Flag;
}
/**
 * Install the stream guard.
 * @param ctx - host plugin context carrying the LLM service.
 * @param config - the row's config, with live volatile fields.
 */
export declare function apply(ctx: Context, config?: GuardConfig): void;
export {};
//# sourceMappingURL=index.d.ts.map