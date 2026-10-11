# Security Policy

## Supported versions

Only the versions below receive security fixes. Older releases are provided "as-is" —
upgrade to a supported line before reporting.

| Version | Supported | Notes |
| --- | --- | --- |
| `main` (latest commit) | :white_check_mark: | Active development |
| Latest tagged release | :white_check_mark: | Fixes are backported when practical |
| Older tagged releases | :x: | Upgrade to the latest release |
| Forks and modified copies | :x: | Report to the maintainer of that fork |

## Reporting a vulnerability

**Do not open a public issue, discussion, or pull request for a security problem.**
A public report exposes every user before a fix exists.

Report privately through GitHub Security Advisories:

1. **GitHub Security Advisories (preferred)** — open
   `https://github.com/icrefin/dsh-context-usage-guard/security/advisories/new`
   (repository → *Security* → *Advisories* → *Report a vulnerability*). This keeps the
   report private and gives us a private fork in which to prepare the fix.

Include in your report:

- Affected version or commit, plus the dsh build and the deployment you ran it in.
- A minimal reproduction (proof of concept, request, or test case).
- Impact assessment: what an attacker gains, and under which preconditions.
- Any fix or mitigation you already know of.
- Whether you intend to publish, and the name you want used for credit.

## Our commitments

| Stage | Target |
| --- | --- |
| Acknowledge receipt | 3 business days |
| Initial assessment and severity triage | 10 business days |
| Fix or documented mitigation | 30 days for high/critical, best effort otherwise |
| Public disclosure | Coordinated with you, after a fix is available |

We credit you in the advisory unless you ask us not to. We will not pursue legal action
against researchers who act in good faith, avoid privacy violations, avoid service
disruption, and give us reasonable time to fix the issue before disclosure.

## Scope

In scope:

- The code in this repository (`icrefin/dsh-context-usage-guard`), including the
  committed bundle in `lib/` and the CI workflows.
- The host half: it sits on the LLM service's `llm/stream` waterfall and withholds one
  kind of chunk — an empty usage sample belonging to an attempt that ended in `error`
  or `aborted`. A way to make it swallow or reorder anything else, to make it withhold a
  sample that carries real provider counts, or to keep it registered after the row is
  disabled or unloaded, is in scope.
- The browser half: it appends one self-tagged `<style>` element to the document head
  and removes it again on unload. A way to make it inject anything other than that one
  declaration, to make the rule apply to controls it is not meant to address, or to
  leave the tag behind after unload is in scope.
- Vulnerabilities exploitable with the default configuration. The plugin has no
  configuration beyond `enabled` and `logHeldSamples`, opens no port, serves no route
  and stores no state.

Out of scope:

- Vulnerabilities in the DeepSeek Harness itself and in third-party dependencies —
  report those upstream; tell us only if this project becomes exploitable as a result.
- Behaviour of the shipped `contextPressure` projection, the shipped stats pills or the
  shipped meter. Their typography and their fold are owned by
  `@deepseek-ai/dsh-token-meter`, `@deepseek-ai/dsh-client-ui-chat` and
  `@deepseek-ai/dsh-client-ui-conversation`; this plugin only repairs their input and
  one declaration in front of them.
- A reading that is *merely wrong* without a security consequence — a context
  percentage that does not match what you expected is a bug, not a vulnerability. Use
  the bug report form for that.
- Social engineering, physical access, and volume-based denial of service.
- Spam and missing rate limits on endpoints the plugin does not serve.
- Issues that require an already-compromised machine or a modified local build.
- Anything on a host you do not own or have written permission to test.

## Safe harbor

If you follow this policy, we consider your research authorized, will work with you to
understand and fix the issue, and will not recommend or support legal action against you.

## Handling secrets in reports

Redact tokens, keys, session content and personal data. Use placeholders such as
`192.0.2.10` and `<YOUR_API_KEY>` when an example is needed, and never paste a real
address or account identifier. A screenshot of the composer footer can carry a
workspace name or a model identifier, so crop it to the figures. If a live credential
must be shown, tell us first and rotate it immediately afterwards.

---

# 安全策略

## 支持的版本

只有下表中的版本会收到安全修复。更早的版本按“现状”提供 —— 报告前请先升级到受支持的分支。

| 版本 | 是否支持 | 说明 |
| --- | --- | --- |
| `main`（最新提交） | :white_check_mark: | 活跃开发 |
| 最新的发布标签 | :white_check_mark: | 可行时会回合修复 |
| 更早的发布标签 | :x: | 请升级到最新发布版 |
| 分支（fork）与改动过的副本 | :x: | 请向该分支的维护者报告 |

## 报告漏洞

**请勿为安全问题开公开 issue、discussion 或 pull request。**
公开报告会在修复发布之前就暴露给所有用户。

请通过 GitHub Security Advisories 私下报告：

1. **GitHub Security Advisories（推荐）** —— 打开
   `https://github.com/icrefin/dsh-context-usage-guard/security/advisories/new`
   （仓库 → *Security* → *Advisories* → *Report a vulnerability*）。报告保持私密，
   同时给我们一个私有分支用于准备修复。

报告中请包含：

- 受影响的版本或 commit，以及你运行的 dsh 版本与所属部署。
- 最小可复现样例（PoC、请求或测试用例）。
- 影响评估：攻击者能获得什么，前置条件是什么。
- 你已知的修复或缓解方式。
- 是否打算公开，以及你希望使用的署名。

## 我们的承诺

| 阶段 | 目标 |
| --- | --- |
| 确认收到 | 3 个工作日 |
| 初步评估与严重性定级 | 10 个工作日 |
| 修复或书面缓解方案 | 高危/严重 30 天内，其余尽力而为 |
| 公开披露 | 与你协商，且在修复可用之后 |

除你要求匿名外，我们会在公告中署名致谢。对于善意研究 —— 不侵犯隐私、不中断服务、
并在披露前给我们合理的修复时间 —— 我们不会采取法律行动。

## 范围

在范围内：

- 本仓库（`icrefin/dsh-context-usage-guard`）的代码，包括 `lib/` 中已提交的 bundle 与
  CI 工作流。
- 宿主侧：它挂在 LLM 服务的 `llm/stream` waterfall 上，只扣下一类 chunk —— 属于以
  `error` 或 `aborted` 结束的尝试的空 usage 样本。若能让它吞掉或重排别的任何东西、
  扣下带有真实 provider 计数的样本，或在行被停用/卸载后仍保持注册，都在范围内。
- 浏览器侧：它向文档 head 追加一个自标记的 `<style>` 元素，并在卸载时移除。若能让它
  注入那一条声明之外的内容、让规则命中它本不该处理的控件，或在卸载后把标签留在原地，
  都在范围内。
- 使用默认配置即可触发的漏洞。本插件除 `enabled` 与 `logHeldSamples` 之外没有配置，
  不开端口、不提供路由、也不保存状态。

不在范围内：

- DeepSeek Harness 自身与第三方依赖的漏洞 —— 请报告给上游；仅当本项目因此变得可被
  利用时再告知我们。
- 随包发布的 `contextPressure` 投影、统计胶囊或 meter 自身的行为。它们的排版与 fold
  归 `@deepseek-ai/dsh-token-meter`、`@deepseek-ai/dsh-client-ui-chat` 与
  `@deepseek-ai/dsh-client-ui-conversation` 所有；本插件只是修它们的输入，以及它们
  前面的一条声明。
- 没有安全后果的*单纯读数错误* —— 上下文百分比与你预期不符是 bug，不是漏洞，请用
  bug 报告表单。
- 社会工程、物理访问，以及靠流量压垮服务的拒绝服务。
- 垃圾信息，以及本插件并不提供的接口上的限流缺失。
- 需要已失陷主机或被改动的本地构建才能成立的问题。
- 任何你并不拥有、也没有书面授权测试的主机。

## 安全港

只要你遵循本策略，我们视你的研究为已授权，会与你一起理解并修复问题，
并且不会建议或支持对你采取法律行动。

## 报告中的密钥处理

请隐去令牌、密钥、会话内容与个人信息。需要示例时请使用 `192.0.2.10`、
`<YOUR_API_KEY>` 这类占位符，切勿粘贴真实地址或账号标识。composer footer 的截图
可能带上工作区名或模型标识，请裁到只剩数字。若必须展示有效凭据，请先告知我们，并在
其后立即轮换。
