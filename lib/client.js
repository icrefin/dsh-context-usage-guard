window.__ModuleLoader__.load({
	id: "dsh-context-usage-guard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/meter-typography.ts
		/**
		* One stylesheet rule: the composer's context-usage percentage, at the size
		* every other figure on its own line already uses.
		*
		* ## What is inconsistent
		*
		* The composer's footer band holds the session statistics and the
		* context-usage meter side by side. Both draw their figures from the same
		* theme token, but the shipped rules disagree by one pixel:
		*
		* ```css
		* /* @deepseek-ai/dsh-client-ui-chat — StatsPills.module.css (the pills) *
		* .OpZ85W_root { font-size: calc(var(--dsh-content-font-size-secondary,13px) - 1px) }
		*
		* /* @deepseek-ai/dsh-client-ui-conversation — ContextMeter.module.css (the ring) *
		* .y0jqnG_trigger { font-size: var(--dsh-content-font-size-secondary,13px) }
		* ```
		*
		* (Class names are content-hashed per build; the declarations are quoted from
		* the 0.2.0-rc.2 bundles, and `test/meter-typography.spec.ts` re-reads both from
		* the installed packages rather than trusting this comment.)
		*
		* So the ring's `30%` is rendered ~8% larger than the `182 steps`, `238 tok/s`,
		* `33.4M tok` and `Cache hit 94%` beside it — which reads as a different font.
		* The meter's own breakdown panel is already `12px`, so the *trigger* is the
		* outlier, not the statistic pills.
		*
		* ## How it is corrected
		*
		* The rule repeats the statistics declaration verbatim, so the two cannot drift:
		* both sides resolve to `secondary - 1px`, and the meter's line box is unchanged
		* because the two shipped rules already share `line-height`.
		*
		* It selects the trigger by its own structural signature rather than by a
		* hashed class name: the meter's button is the only `aria-haspopup="dialog"`
		* button whose icon is the ring itself — an inline `<svg>` with `<circle>`
		* children. The statistics pills are the same kind of button but draw
		* `<path>`-based icons, so they never match. Specificity
		* `(0,1,3)` beats the shipped `(0,1,0)`, so no `!important` is needed, and a
		* build that renames the class cannot break the rule.
		*
		* @module dsh-context-usage-guard/client/meter-typography
		*/
		/** The plugin id the loader knows this package by, also used to claim the style tag. */
		const PLUGIN_ID = "dsh-context-usage-guard";
		/** Identity of the tag, so injection is idempotent and the loader can evict it. */
		const STYLE_TAG_ID = `${PLUGIN_ID}/meter-typography.css`;
		/** The whole stylesheet: one rule, one declaration. */
		const METER_TYPOGRAPHY_CSS = `button[aria-haspopup="dialog"]:has(> svg > circle){font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px)}`;
		/**
		* Install the rule, or adopt the tag that already carries it.
		*
		* The tag is self-tagged with `data-plugin`, which is what the client module
		* system evicts when this plugin unloads; the returned disposer covers a row
		* that is disabled while the page stays open.
		*
		* @param doc - the document to install into.
		* @returns a disposer that removes this plugin's tag.
		*/
		function installMeterTypography(doc) {
			const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`;
			const existing = doc.querySelector(selector);
			if (existing !== null) return () => existing.remove();
			const tag = doc.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = METER_TYPOGRAPHY_CSS;
			doc.head.append(tag);
			return () => tag.remove();
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-context-usage-guard — browser half.
		*
		* The host half keeps the ring's *value* honest across a retry; this half keeps
		* its *typography* consistent with the figures beside it. See
		* `meter-typography.ts` for the one-pixel mismatch being corrected and why the
		* selector is structural.
		*
		* The tag is created when the bundle materializes, because that is the moment
		* the client module system claims styles from and the moment it evicts them
		* again; `apply` re-asserts it and registers its removal on the plugin's own
		* effect, so a row disabled while the page stays open also cleans up.
		*
		* A client `apply` that throws takes the whole shell boot down with it — the
		* loader fails the boot when a plugin's `apply` throws — so the body is wrapped.
		*
		* @module dsh-context-usage-guard/client
		*/
		/**
		* Keep the meter's percentage at the composer footer's figure size.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			try {
				ctx.effect(() => installMeterTypography(document), "dsh-context-usage-guard: meter typography");
			} catch (error) {
				console.warn("[dsh-context-usage-guard] the meter typography rule could not be installed", error);
			}
		}
		installMeterTypography(document);
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map