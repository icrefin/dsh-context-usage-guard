# Contributing to icrefin/dsh-context-usage-guard

Thanks for taking the time to contribute. This document covers the repository
**dsh-context-usage-guard** owned by `icrefin`.

This plugin repairs two defects in the composer's context-usage ring: the host
half withholds an empty usage sample that belongs to a failed model attempt, and
the browser half adds one stylesheet rule that puts the meter's percentage at the
statistics pills' figure size. Both halves are small on purpose — the interesting
work is in the tests and in the comment that explains why each rule is safe.

## Ways to contribute

- Report a bug using the *Bug report* issue form.
- Request a feature using the *Feature request* issue form.
- Reproduce a report against a dsh build you have and say so on the issue.
- Send a pull request that fixes or implements something on the issue tracker.

If you plan a large change, open an issue first so we can agree on the design
before you write the implementation.

## Before you start

1. Search existing issues and pull requests to avoid duplicates.
2. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
3. Check the README for supported versions and prerequisites.

## Development setup

This is a TypeScript package built with pnpm. It needs **Node >= 22.17.0** and
**pnpm 11.8.0**. The `@deepseek-ai/dsh-*` peer dependencies are resolved from the
registry, so a clean checkout really does install.

```bash
git clone https://github.com/icrefin/dsh-context-usage-guard.git
cd dsh-context-usage-guard
git switch main

corepack enable
pnpm install
pnpm check          # tsc over both halves, then vitest
```

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc` over the host half and, separately, over the browser half |
| `pnpm test` | `vitest run` — 40 tests in the five suites listed below |
| `pnpm check` | `pnpm typecheck && pnpm test` — run this before opening a pull request |
| `pnpm build` | `tsc -p tsconfig.build.json` then `tsdown` — rewrites `lib/` |
| `pnpm pack` | `pnpm build`, then `npm pack` into `dist/` |

**`lib/` is committed in this repository.** The published bundle is what users
install, so a change that affects either half must rebuild it and include the
result in the same pull request; `dist/` stays out of the tree.

## Where the code lives

| Path | Role |
| --- | --- |
| `src/index.ts` | host half: `name`, `inject`, `Config`, and the `llm/stream` listener |
| `src/guard.ts` | the retry rule, as a pure chunk filter over the stream protocol |
| `src/client/index.ts` | browser half: installs the stylesheet and registers its removal |
| `src/client/meter-typography.ts` | the one rule, its structural selector, and the shipped declarations it mirrors |
| `cordis.patch.yml` | the bundle patch that inserts the row into a profile's roster |
| `lib/` | the committed build output: `index.js`, `guard.js`, `client.js` and the type declarations |
| `test/` | the five suites below, and the shipped-code readers they use |
| `scripts/` | `install.sh` (pack and install) and `dev-profile.sh` (isolated profile) |
| `tools/preview.mjs` | renders the footer band outside the GUI and screenshots it |

## The test suites

| Suite | Tests | What it drives |
| --- | --- | --- |
| `test/guard.spec.ts` | 13 | the chunk filter, fed the *verbatim* recorded chunks of the failed attempt (`test/recorded.ts`) |
| `test/plugin.spec.ts` | 8 | the real `apply()`: listener registration and teardown, enable/disable, live volatile reads, diagnostics logging |
| `test/fold.spec.ts` | 6 | the **shipped** `contextPressure` and `tokenUsage` folds, over the real durable sequence around the retry |
| `test/cordis.spec.ts` | 2 | activation on a **real cordis Context**: the `inject: ['llm']` gate, dispatch through the real `llm/stream` waterfall, and the listener leaving the waterfall on unload |
| `test/meter-typography.spec.ts` | 11 | the rule in jsdom: the size read from the **installed** `dsh-client-ui-chat` and `dsh-client-ui-conversation` bundles, and the selector against the markup shapes both components render |

Two support modules read shipped code by path, because neither the projection
units nor the shipped stylesheets are part of an export map:
`test/support/token-meter.ts` and `test/support/shipped-styles.ts`. Both fail
loudly when the layout moves, so a runtime upgrade becomes a visible test failure
rather than a silent pass.

`test/meter-typography.spec.ts` is also the browser half's self-limiting
condition: it fails once the two shipped declarations converge, which is the
signal that the rule should be deleted rather than kept.

## Verification

Checked before a release, on Node 22 with pnpm 11.8.0 against dsh `0.2.0-rc.2`:

- `pnpm check` — both halves typecheck, and 40 tests pass in the five suites above.
- `pnpm build` — the bundles it rewrites satisfy the manifest: the `dsh.bundle.patch`
  row id, the package name and the `window.__ModuleLoader__` id in `lib/client.js`
  all agree, and the row composes into a profile booted from the shipped `web`
  template (see `scripts/dev-profile.sh`), appearing in that page's boot graph as
  `dsh-context-usage-guard/client.js`.
- `node tools/preview.mjs` — the render check reported by the page: the pills'
  figure size, the meter's with the rule (`12px`), the meter's with the rule's tag
  disabled (`13px`), the reading, and that the selector matches the trigger and
  none of the pills. The harness exits non-zero on any of those.

Not checked by automation: the pixels painted inside a live GUI session with a
user's own theme and font settings, and an end-to-end retry storm against a real
provider — the fold suite replays a recorded sequence instead.

## Installing the bundle into a profile

```bash
pnpm build
sh scripts/install.sh                 # packs dist/dsh-context-usage-guard-<version>.tgz
sh scripts/install.sh --profile tui   # ...or install into a CLI-managed profile
```

The desktop profile is owned by the Electron application, so `dsh plugin add`
refuses it: install the tarball from **Settings → Plugins**, then restart. A
bundle added to a running profile cannot be imported by that process — its module
path is not in the resolution the harness computed at boot.

`scripts/dev-profile.sh` boots the row in an **isolated** profile under
`.dev-home/` (a private dsh home, safe to delete) instead of the live one, and
`scripts/dev-profile.sh dump` prints the composed row. That is the cheapest way to
prove the patch row still composes and the host half activates.

`tools/preview.mjs` renders the built browser half outside the GUI, over a
rehearsal of the composer footer drawn from the installed stylesheets, and
screenshots it with headless Chrome. It fails the render unless the meter's
rendered font size equals the pills' and did not equal them before the rule.

```bash
node tools/preview.mjs --out /tmp/cug-preview     # writes index.html + composer-footer.png
node tools/preview.mjs --png docs/images/context-usage-ring.png
```

Not covered by automation: a real retry storm against a live provider (the fold
suite replays the recorded sequence instead), and the pixels inside a live GUI
session with a user's own theme and font settings.

## Branch and commit conventions

- Branch from `main`; keep one topic per branch (`fix/...`, `feat/...`, `docs/...`).
- Keep commits small and focused.
- Write imperative, scoped commit messages, e.g. `fix(guard): keep a partial usage sample`.
- Rebase onto the latest `main` before requesting review; avoid merge commits inside the PR branch.

## Pull requests

Every pull request must:

- Explain **what** changed and **why**.
- Link the issue it closes (`Closes #123`).
- Pass CI (`pnpm typecheck` and `pnpm test`, on Node 22 with pnpm).
- Rebuild `lib/` and commit it when either half changes.
- Update documentation whenever user-facing behavior changes — including both
  the English and the Chinese READMEs.
- Contain no secrets, tokens, private keys, internal hostnames, or personal data.
  A screenshot of the meter line is welcome, but crop out everything around it.
- State the license of any newly added dependency and confirm it is compatible with
  this project's `MIT` license.

Use the repository's pull request template. Do not delete checklist items without
explaining why.

## Reporting bugs

A useful bug report contains:

- The version, commit SHA, or release tag of the plugin you tested.
- The DeepSeek Harness build you ran it against, and how the plugin was installed.
- Whether a retry was in flight when the wrong reading appeared, and whether the
  wrong reading was `0%` or a percentage that looks out of scale.
- A screenshot of the composer footer line, with anything sensitive cropped out.
- Exact reproduction steps, expected result, and actual result.
- Logs with secrets and personal data removed.

Report security vulnerabilities privately — see [SECURITY.md](SECURITY.md). Never open
a public issue for a vulnerability.

## Coding style

- Match the style of the surrounding code; do not reformat unrelated files.
- Add or update tests for behavior changes.
- Keep public APIs documented.
- Prefer clear names over comments that restate the code — but do keep the comment
  that explains *why* a stream chunk may be dropped, and the one that explains why
  the selector is structural. Those two are the load-bearing parts of this plugin.
- Do not add a dependency for something the standard library already does.
- Keep the two halves apart: `src/index.ts` and `src/guard.ts` run on the host,
  `src/client/*` runs in the browser, and neither half imports the other's code.
- The browser half must stay a stylesheet rule: no component replacement, no
  DOM rewriting, no `!important` where specificity already wins.
- Tests that read shipped code by path (`test/support/*`) must keep failing loudly
  when the shipped layout moves; do not soften them into skips.

## Review process

Maintainers review pull requests as time allows. Expect at least one round of
feedback. Address comments with follow-up commits or a rebase, then re-request review.
A pull request inactive for 60 days without response may be closed.

## License and sign-off

Contributions are accepted under the same `MIT` license as this repository:
**inbound equals outbound**. By opening a pull request you agree that your
contribution is licensed under those terms, and you confirm you have the right to
submit it. Do not paste code you cannot license under them.

Every commit must carry a `Signed-off-by:` line — `git commit -s` adds it — by
which you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org/):
that you wrote the change or otherwise have the right to submit it under this
project's license. A pull request whose commits lack the sign-off will be asked
to add it before review.

## Questions

Open a discussion on the repository, or comment on an existing issue.

---

# 为 icrefin/dsh-context-usage-guard 贡献

感谢你抽出时间参与贡献。本文适用于 `icrefin` 名下的仓库
**dsh-context-usage-guard**。

这个插件修复 composer 里上下文用量环的两处缺陷：宿主侧扣下一个属于失败模型尝试的空
usage 样本，浏览器侧只加一条样式规则，把 meter 的百分比设成统计胶囊的字号。两半都
刻意做得很小——真正花功夫的地方在测试，以及在注释里说清每条规则为什么是安全的。

## 贡献方式

- 用 *Bug report* 表单报告问题。
- 用 *Feature request* 表单提出需求。
- 用你手上的 dsh 版本复现别人的报告，并在 issue 里说明结果。
- 提交 pull request，修复或实现 issue 中的事项。

如果改动较大，请先开 issue 讨论设计，以免实现在错误的方向上白费功夫。

## 开始之前

1. 先搜索已有的 issue 和 pull request，避免重复。
2. 阅读[行为准则](CODE_OF_CONDUCT.md)。
3. 查看 README 中说明的支持版本与前置条件。

## 开发环境

本项目是用 pnpm 构建的 TypeScript 包，需要 **Node >= 22.17.0** 与
**pnpm 11.8.0**。`@deepseek-ai/dsh-*` 这些 peer 依赖从 registry 解析，因此在干净的
检出上可以直接安装。

```bash
git clone https://github.com/icrefin/dsh-context-usage-guard.git
cd dsh-context-usage-guard
git switch main

corepack enable
pnpm install
pnpm check          # 先 tsc 检查两侧，再跑 vitest
```

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | 分别对宿主侧与浏览器侧执行 `tsc` |
| `pnpm test` | `vitest run` —— 下表 5 个套件共 40 个测试 |
| `pnpm check` | `pnpm typecheck && pnpm test` —— 提 PR 前请跑这个 |
| `pnpm build` | 先 `tsc -p tsconfig.build.json`，再 `tsdown` —— 会重写 `lib/` |
| `pnpm pack` | 先 `pnpm build`，再用 `npm pack` 打包到 `dist/` |

**本仓库把 `lib/` 纳入版本库。** 用户安装的就是这份产物，所以任何影响两半之一的改动
都必须在同一个 pull request 里重新构建并提交结果；`dist/` 不进版本库。

## 代码都在哪

| 路径 | 职责 |
| --- | --- |
| `src/index.ts` | 宿主半：`name`、`inject`、`Config`，以及 `llm/stream` listener |
| `src/guard.ts` | 重试规则，作为流协议之上一个纯粹的 chunk 过滤器 |
| `src/client/index.ts` | 浏览器半：装上样式表并注册它的移除 |
| `src/client/meter-typography.ts` | 那一条规则、它的结构选择器，以及它所对照的随包声明 |
| `cordis.patch.yml` | 把这一行插进 profile 花名册的 bundle patch |
| `lib/` | 已提交的构建产物：`index.js`、`guard.js`、`client.js` 与类型声明 |
| `test/` | 下表的 5 个套件，以及它们所用的随包代码读取器 |
| `scripts/` | `install.sh`（打包并安装）与 `dev-profile.sh`（隔离 profile） |
| `tools/preview.mjs` | 在 GUI 之外渲染 footer 区并截图 |

## 测试套件

| 套件 | 测试数 | 覆盖内容 |
| --- | --- | --- |
| `test/guard.spec.ts` | 13 | chunk 过滤器，喂给它的是那次失败尝试*逐字*录下的 chunk（`test/recorded.ts`） |
| `test/plugin.spec.ts` | 8 | 真实的 `apply()`：listener 注册与拆除、启用/停用、读取 volatile 实时值、诊断日志 |
| `test/fold.spec.ts` | 6 | **随包发布的** `contextPressure` 与 `tokenUsage` fold，跑在重试前后的真实持久化序列上 |
| `test/cordis.spec.ts` | 2 | 在**真实 cordis Context** 上激活：`inject: ['llm']` 门控、经由真实 `llm/stream` waterfall 的分发、以及卸载时 listener 退出 waterfall |
| `test/meter-typography.spec.ts` | 11 | jsdom 里的那条规则：从**已安装的** `dsh-client-ui-chat` 与 `dsh-client-ui-conversation` bundle 中读出的字号，以及选择器对两个组件真实渲染出的标记形状的匹配结果 |

有两个支撑模块按路径读取随包代码，因为投影单元和随包样式表都不在 export map 里：
`test/support/token-meter.ts` 与 `test/support/shipped-styles.ts`。布局一旦移动它们
就会大声失败，因此运行时升级会变成一个可见的测试失败，而不是无声通过。

`test/meter-typography.spec.ts` 同时也是浏览器侧的失效条件：随包的两条声明一旦收敛
它就会失败，那正是应当删掉这条规则的信号。

## 验证

发布前会检查以下内容，环境为 Node 22 + pnpm 11.8.0，针对 dsh `0.2.0-rc.2`：

- `pnpm check` —— 两半都通过类型检查，且上表 5 个套件共 40 个测试全部通过。
- `pnpm build` —— 它重写出的 bundle 满足 manifest：`dsh.bundle.patch` 行 id、包名与
  `lib/client.js` 里的 `window.__ModuleLoader__` id 三者一致；这一行能组合进一个从
  随包 `web` 模板启动的 profile（见 `scripts/dev-profile.sh`），并出现在该页面的启动
  图中，名为 `dsh-context-usage-guard/client.js`。
- `node tools/preview.mjs` —— 页面回报的渲染检查：胶囊的字号、装上规则后 meter 的字号
  （`12px`）、禁用规则标签后 meter 的字号（`13px`）、读数，以及选择器命中 trigger 且
  不命中任何胶囊。其中任何一项不成立，这个工具就以非零状态退出。

自动化没有检查的部分：实机 GUI 会话在用户自己的主题与字体设置下画出的像素，以及针对
真实 provider 的一次端到端重试风暴 —— fold 套件改为回放录下的序列。

## 把 bundle 装进 profile

```bash
pnpm build
sh scripts/install.sh                 # 打出 dist/dsh-context-usage-guard-<version>.tgz
sh scripts/install.sh --profile tui   # ……或装进 CLI 管理的 profile
```

桌面 profile 归 Electron 应用所有，所以 `dsh plugin add` 会拒绝它：请在
**Settings → Plugins** 里安装这个 tarball，然后重启。装进一个正在运行的 profile 的
bundle，那个进程 import 不了——它的模块路径不在 harness 启动时算出的解析结果里。

`scripts/dev-profile.sh` 会在 `.dev-home/`（一个私有 dsh home，可随时删除）下的
**隔离** profile 里启动这一行，而不是碰在用的那个；
`scripts/dev-profile.sh dump` 会打印组合后的行。这是证明 patch 行仍能组合、宿主侧能
激活的最省事的办法。

`tools/preview.mjs` 在 GUI 之外渲染构建好的浏览器侧，底下是从已安装样式表画出的
composer footer 排练页，并用无头 Chrome 截图。除非 meter 的渲染字号等于胶囊的、
且在装上这条规则之前并不相等，否则它会判定渲染失败。

```bash
node tools/preview.mjs --out /tmp/cug-preview     # 写出 index.html 与 composer-footer.png
node tools/preview.mjs --png docs/images/context-usage-ring.png
```

自动化没有覆盖的部分：针对真实 provider 的一次真实重试风暴（fold 套件改为回放录下的
序列），以及实机 GUI 会话在用户自己的主题与字体设置下画出的像素。

## 分支与提交规范

- 从 `main` 拉分支，一个分支只做一件事（`fix/...`、`feat/...`、`docs/...`）。
- 提交粒度尽量小。
- 提交信息用祈使句并带范围，例如 `fix(guard): keep a partial usage sample`。
- 请求评审前先 rebase 到最新的 `main`；PR 分支内避免合并提交。

## Pull request 要求

每个 pull request 必须：

- 说明改了**什么**、**为什么**改。
- 关联对应 issue（`Closes #123`）。
- 通过 CI（Node 22 + pnpm 上跑 `pnpm typecheck` 与 `pnpm test`）。
- 当两半之一有改动时，重新构建 `lib/` 并提交。
- 当用户可见行为变化时更新文档，包括英文与中文两份 README。
- 不含任何密钥、令牌、私钥、内网主机名或个人数据。欢迎附 meter 那一行的截图，
  但请裁掉周围一切内容。
- 说明新增依赖的许可证，并确认与本项目的 `MIT` 许可证兼容。

请使用仓库的 pull request 模板；不要在没有说明理由的情况下删除检查项。

## 报告 bug

一份有效的 bug 报告应包含：

- 你测试的插件版本号、commit SHA 或发布标签。
- 你运行它所用的 DeepSeek Harness 版本，以及插件的安装方式。
- 出现错误读数时是否正在重试，以及错误读数是 `0%`，还是一个明显不合比例
  的百分比。
- composer footer 那一行的截图，裁掉敏感内容。
- 精确的复现步骤、期望结果与实际结果。
- 去除密钥与个人信息后的日志。

安全漏洞请私下报告，见 [SECURITY.md](SECURITY.md)。切勿为漏洞开公开 issue。

## 代码风格

- 与周边代码风格保持一致；不要顺手重排无关文件。
- 行为变更需要新增或更新测试。
- 公开 API 必须有文档。
- 命名要清晰，避免复述代码的注释——但请保留说明*为什么*可以丢弃某个 chunk 的那段
  注释，以及解释选择器为何是结构性的那段注释。这两处是本插件的承重结构。
- 标准库已能实现的功能，不要新增依赖。
- 保持两侧分离：`src/index.ts` 与 `src/guard.ts` 跑在宿主侧，`src/client/*` 跑在
  浏览器侧，两半互不 import。
- 浏览器侧必须保持为一条样式规则：不替换组件、不改写 DOM、在特异性已经胜出的地方
  不加 `!important`。
- 按路径读取随包代码的测试（`test/support/*`）必须保持「布局移动就大声失败」，
  不要把它们软化成一跳了之。

## 评审流程

维护者会在时间允许时评审 pull request，通常至少有一轮反馈。请通过后续提交响应意见，
或推送 rebase 后重新请求评审。超过 60 天无回应的 pull request 可能被关闭。

## 许可证与 sign-off

贡献按与本仓库相同的 `MIT` 许可证接受：**inbound 等于 outbound**。提交 pull request
即表示你同意自己的贡献按该条款授权，并确认你有权提交它。请勿粘贴你无权按此条款授权
的代码。

每个提交都必须带 `Signed-off-by:` 行——`git commit -s` 会自动加上——以此声明你同意
[Developer Certificate of Origin 1.1](https://developercertificate.org/)：这个改动由你
编写，或者你有权按本项目的许可证提交它。提交缺少 sign-off 的 pull request 会被要求
先补上，再进入评审。

## 疑问

请在仓库里开 discussion，或在已有 issue 下留言。
