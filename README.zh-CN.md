# dsh-context-usage-guard

让 DeepSeek Harness composer 里的上下文用量环保持诚实：重试期间的空 usage 样本
不再把它压成 `0%`，而它的百分比也和旁边的数字同字号。
[English](README.md) | **简体中文**

[![License](https://img.shields.io/github/license/icrefin/dsh-context-usage-guard?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/icrefin/dsh-context-usage-guard?style=flat-square)](https://github.com/icrefin/dsh-context-usage-guard/releases/tag/v0.2.1)
[![CI](https://img.shields.io/github/actions/workflow/status/icrefin/dsh-context-usage-guard/ci.yml?branch=main&style=flat-square)](https://github.com/icrefin/dsh-context-usage-guard/actions/workflows/ci.yml)
[![Last commit](https://img.shields.io/github/last-commit/icrefin/dsh-context-usage-guard?style=flat-square)](https://github.com/icrefin/dsh-context-usage-guard/commits/main)
[![Stars](https://img.shields.io/github/stars/icrefin/dsh-context-usage-guard?style=flat-square)](https://github.com/icrefin/dsh-context-usage-guard/stargazers)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/icrefin/dsh-context-usage-guard/pulls)
[![Node](https://img.shields.io/badge/node-%3E%3D22.17-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.3-4B5563?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）
插件，修复 composer 里**上下文用量环**的两处缺陷——一处是它显示的数值，一处是
这个数值被画成多大：

1. 模型请求重试期间，环不再掉到 `0%`——宿主侧；以及
2. 环的百分比与同一行里其他数字同字号——浏览器侧，一条样式规则。

## 它修复的两个 bug

```
One line, in the composer footer:

  182 steps · 238 tok/s      33.4M tok · Cache hit 94%      ◯ 30%
                                                             ↑
              the ring's 30% was one pixel larger than every other figure

Mid-retry, the same ring read 0% instead of holding the last real reading:

  ◯ 0%   →   ◯ 6%
```

### 请求重试期间，环会塌到 `0%`

环渲染的是会话投影 `contextPressure`。这个投影把**最新的 usage 样本**当作当前
prompt 大小，并发布：

```text
pressureTokens  = usage.inputTokens + cacheReadTokens + cacheWriteTokens
projectedTokens = max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens)
```

一次在 provider 报告任何东西之前就失败的模型调用——`429`、限流、超时、传输错误，
或者用户取消——照样会用一个 `usage` chunk 结束自己的流：

```jsonc
[ { "type": "chunk", "chunk": { "type": "usage",  "usage": { "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 } } },
  { "type": "chunk", "chunk": { "type": "finish", "reason": { "kind": "error",
      "failure": { "code": "RATE_LIMIT", "message": "429: token_capacity_exceeded" } } } } ]
```

adapter 的累加器从 0 开始，而没有任何东西覆盖过它，所以这个样本是*空的*，不是
一次测量。但它恰恰是最新的样本，于是 `pressureTokens` 变成 `0`；又因为这个样本
打在当前的 surface 总量上，投影就发布了 `projectedTokens: 0`。`@deepseek-ai/dsh-llm-retry`
随后重试同一步——在写出这个插件的那个会话里重试了六次——整场重试风暴期间环都
读作 `0%`，把一个根本没有变化的上下文报成了别的样子。

针对随包发布的 `contextPressure` fold 实测，回放该会话的真实事件
（`test/fold.spec.ts`）：

| 回放 | `pressureTokens` | `projectedTokens` | 环 |
|---|---|---|---|
| 最后一次成功调用之后、重试之前 | 64 389 | 64 389 | `6%` |
| 这次失败的尝试，**未拦截** | 0 | 0 | `0%` ← 症状 |
| 这次失败的尝试，**已拦截** | 64 389 | 64 389 | `6%` |
| 重试的那一步最终成功 | 64 575 | 64 575 | `6%` |

### 百分比比旁边的数字大一个像素

同一条 footer 区里既有会话统计、也有这个环，而两份随包样式表对「一个数字画多大」
的判断差了一个像素：

```css
/* @deepseek-ai/dsh-client-ui-chat — StatsPills.module.css, the pills */
.bOPqQW_root    { font-size: calc(var(--dsh-content-font-size-secondary,13px) - 1px) }

/* @deepseek-ai/dsh-client-ui-conversation — ContextMeter.module.css, the ring */
.JObwrW_trigger { font-size: var(--dsh-content-font-size-secondary,13px) }
```

两个前缀都是按构建内容哈希出来的——上面这一对是这里安装到的 `0.2.1-rc.3` 包所带的；
真正要紧的是那两条*声明*，`test/meter-typography.spec.ts` 会从已安装的包里重新读
它们，而不是相信这段引文。

于是 `30%` 比旁边的 `182 steps`、`238 tok/s`、`33.4M tok`、`Cache hit 94%` 大出
约 8%，看起来像另一种字体。对那一行截图实测：其他每个数字的 cap height 都是
12 px，环的是 13–14 px——比值 1.08，恰好是 `13 ÷ 12`。meter 自己的明细面板本来
就是 `12px`，所以 trigger 才是那个异类。

## 这个插件做了什么

| 半边 | 位置 | 作用 |
|---|---|---|
| 宿主 | `llm/stream` waterfall | 一个 listener：把属于失败尝试的空 usage 样本扣下，让投影保留上一次真实读数 |
| 浏览器 | 文档 `head` | 一条自标记的样式规则：把 meter 的百分比设成统计胶囊的字号 |

两半都没有新增页面、路由、设置区块或落盘文件。宿主侧声明了 `inject: ['llm']`，所以
LLM 服务必须先存在；它注册在 `ctx.effect` 里：卸载时、profile patch 关掉这一行时、
或进程退出时 cordis 会执行 disposer——裸的 `ctx.on` 会把 listener 泄漏到卸载之后。

一条规则，作用于每一次模型调用的 chunk 流：

> 一个**所报告的每个计数都是零**的 usage 样本没有测量到任何东西。当它属于一次以
> `error` 或 `aborted` 结束的尝试时，就丢弃它，让上一次真实读数继续成立。

其余一切原样通过：

- **一次成功的完成**，无论它报告什么——`stop`、`tool-calls` 和 `max-tokens` 是
  provider 给出的权威回答，那里的零留给消费方判断；
- **一次确实报告了内容的失败尝试**——部分完成的调用可能带着真实的 input 计数，
  所以任何计费计数都不会被丢掉；
- **流的形状、顺序与时序**——被扣下的样本是唯一位置会动的 chunk；可见的 delta
  保持原有顺序，重试执行器读取的终止 `finish` 原样保留。

## 修复是怎么起作用的

### 宿主侧：决定读数的那个样本永远不会落地

这层包装**最多**持有一个 `usage` chunk，并在下一个 chunk 之前立刻释放它，所以
位置可能变化的只有决定结果的那个样本。没有终止 `finish` 就结束的流也会释放被扣下
的样本——guard 绝不吞掉它没有明确决定丢弃的信息。在流协议里扣掉这个 chunk 是合法
的：`usage` 最多出现一次、也从不是必需的，没有它 `BlockAssembler.usage` 保持
`undefined`，而 agent loop 本来就会省略持久化事件里的 `usage` 字段，而不是失败。
token 记账不受影响——投影的 usage fold 把空样本的各桶按零累加，`test/fold.spec.ts`
直接钉住了这一点。

### 浏览器侧：一条样式规则

浏览器侧新增一条样式规则，逐字复述统计胶囊的那条声明：

```css
button[aria-haspopup="dialog"]:has(> svg > circle) {
  font-size: calc(var(--dsh-content-font-size-secondary,13px) - 1px);
}
```

- **结构选择器，不是类名。** meter 的按钮是唯一一个图标*就是*环（内联 `<svg>` 带
  `<circle>` 子节点）的 dialog 按钮，而统计胶囊画的是 `<path>` 图标。重新哈希所有
  类名的构建也破坏不了这条规则，胶囊则永远匹配不上。特异性 `(0,1,3)` 高于随包的
  `(0,1,0)`，所以不需要 `!important`。
- **一条声明。** 没有隐藏、移动、改色或替换任何东西；行盒不变，因为随包的两条规则
  本来就共用 `line-height`。
- **自带失效条件。** `test/meter-typography.spec.ts` 从已安装的包里读出这两条声明，
  二者一旦收敛测试就失败——上游修好 trigger 的那个版本会明说，而不是留下一处无声
  的 workaround。

## 截图

![composer footer：会话统计胶囊与上下文用量环，字号一致](docs/images/context-usage-ring.png)

`tools/preview.mjs` 在 GUI 之外渲染出的 footer 区：胶囊的
`26 turns 182 steps · 238 tok/s`、`33.4M tok · Cache hit 94%`，以及环的 `30%`，
现在共用一个字号——全部取自安装好的 `dsh-client-ui-chat` 与
`dsh-client-ui-conversation` 样式表。图中数字是对合理会话投影的回放，不是抓取：
这个工具既不读会话日志，也不读 profile，更不碰网络。

## 环境要求

| 要求 | 版本 | 说明 |
|---|---|---|
| DeepSeek Harness | `0.2.1-rc.3` | 本构建钉住的 `dsh` 版本；peer 依赖为 `@deepseek-ai/cordis` ^4.0.5、`@deepseek-ai/dsh-llm` 0.2.1-rc.3、`@deepseek-ai/schemastery` ^3.18.5 |
| Node.js | `>=22.17.0` | `package.json` 里的 `engines.node` |
| pnpm | `11.8.0` | 仅用于开发这个仓库：`pnpm check` 与 `pnpm build` |
| Google Chrome、Chromium 或 Edge | 任意较新版本 | 仅用于截图工具 `tools/preview.mjs` |

构建产物已在 `lib/` 中提交，所以安装这个插件不需要构建步骤，也不需要目标 harness
之外的任何工具链。

## 安装

```sh
git clone https://github.com/icrefin/dsh-context-usage-guard.git
cd dsh-context-usage-guard
sh scripts/install.sh
```

`scripts/install.sh` 会打出 `dist/dsh-context-usage-guard-0.2.1.tgz`，并打印要交给
应用的路径。桌面 profile 归 Electron 应用所有，所以 `dsh plugin add` 会拒绝它：
请在 **Settings → Plugins** 里安装这个 tarball（或者用插件管理器工具），然后
**重启**。装进一个正在运行的 profile 的 bundle，那个进程 import 不了——它的模块
路径不在 harness 启动时算出的解析结果里——而浏览器侧还需要刷新页面。

安装前后想跑测试的话：

```sh
pnpm install
pnpm check     # tsc over both halves, then 40 tests in five suites
```

（`pnpm check` 先对两半做 tsc，再跑 5 个套件共 40 个测试。）

两条运维上的注意事项：

- **重装同一个版本等于什么都没做。** pnpm 看到 spec 没变，就放着 `node_modules`
  里已解压的那份不管，所以同一版本下重新构建的 tarball 到不了 profile。先移除这个
  bundle，再装一次——或者把版本号往上提。
- **宿主侧的改动只有在下次启动时才会抵达正在运行的应用。** 首次安装时，宿主
  listener 和浏览器侧注册都在安装完成后立刻生效。此后两半开始分道扬镳：浏览器
  bundle 会随其 revision 变化被重新导入，而宿主这一半是启动时的 ESM 导入，会一直
  提供进程启动时载入的那份代码。这是上游行为；客户端侧的改动永远不需要重启。

### 卸载

从 **Settings → Plugins**（或用插件管理器工具）移除这个 bundle 并重启。它不写别的
任何东西：没有路由、没有文件、没有持久状态。样式表随 bundle 一起走——客户端模块
系统会清掉任何标记为本包的 `<style>`，而插件自己的 effect 会更早把它移除。

## 配置

这一行的 `Config` 就是设置命名空间，所以值写在 `<profile>/cordis.patch.yml` 中该行
的 `config` 里：

```yaml
- id: dsh-context-usage-guard
  config:
    enabled: true
    logHeldSamples: false
```

| 字段 | 类型 | 默认值 | 含义 |
|---|---|---|---|
| `enabled` | boolean | `true` | 关闭时，所有流原样通过。 |
| `logHeldSamples` | boolean | `false` | 每扣下一个样本就记一行宿主日志：route 与失败码。 |

两个字段都是 volatile 的，所以改动对下一个请求即生效，无需重新加载。默认值除了
修复本身之外不改变任何行为：全新安装的表现，就像一次保持上下文读数诚实的原装安装。

```text
[dsh-context-usage-guard] held an empty usage sample from a failed request
  (example-provider/example-model-v1, RATE_LIMIT); the context reading stays at its last value
```

## 这个插件刻意不做的事

- **它不动投影注册表。** `dsh-token-meter` 在内部注册 `contextPressure`，而注册表对
  同一个 key 是*共享*而非替换，所以第二次注册覆盖不了这个 fold，而抢先重新注册同一个
  key 又会劫持一个不属于本插件的包。修 fold 的输入才是那个窄修复；fold 本身留给它
  的拥有者。
- **它不替换、也不重绘环的组件。** meter 渲染在 `dsh-client-ui-conversation` 的输入
  栏里，没有扩展位。浏览器侧所做的唯一一件事，就是给那个统计数字已经证明有问题的
  trigger 加一条 `font-size` 声明；环、它的图标、配色、悬停态和弹窗，都是随包的那套。
- **它不编造数字。** 当从来没有报告过任何可测量的东西时，投影保持缺席、环保持隐藏
  ——这是随包行为——而不是显示一个没人测量过的值。
- **它不冻结读数。** 下一次成功的尝试会报告真实 usage，环随之推进，套件对此有断言。

## 局限

- **修复针对的是*失败的*尝试。** 成功的完成报告的是 provider 发来的内容，零也算：
  一个带零计数的 `stop`/`tool-calls`/`max-tokens` 回答仍然是回答。插件从不改写
  provider 自己给出的数字。
- **浏览器侧是一个自带失效条件的 workaround。** 它存在的原因是随包的两条声明不一致；
  它们一旦收敛，套件就会失败，那时应当删掉这条规则，而不是留着。
- **它的像素是在 GUI 之外检查的，不是在实机会话里。** `tools/preview.mjs` 在无头
  Chrome 里渲染真实的 bundle 与真实的样式表，meter 与胶囊不一致就报错；而应用在
  用户自己的主题和字体设置下画出什么，没有自动化断言。
- **宿主侧只看得到走 LLM 服务的调用。** 它挂在 `llm/stream` waterfall 上，也就是
  harness 路由模型调用的地方；绕过这个服务直连 provider 的路径，本插件既保护不到，
  也不会弄坏。

## 常见问题

**环还是读作 `0%`。** 先确认 `enabled` 是 `true`。如果是，那这个读数来自一次成功
完成的调用：guard 只拦截以 `error` 或 `aborted` 结束的尝试里的空样本，而一次报告了
零的成功回答留给消费方判断。重试的那一步成功之后，读数会交回给下一个真实的 usage
样本。

**百分比看起来还是比旁边的数字大。** 这条规则是在浏览器侧注册时装上的，所以装进一个
正在运行的应用后需要 [安装](#安装) 里说的那次重启，然后刷新页面。之后，
`test/meter-typography.spec.ts` 就是权威：随包声明一旦收敛它就会失败，那正是删掉
这条规则的信号。

**日志里始终没有 `held an empty usage sample` 那一行。** 那一行由 `logHeldSamples`
控制，默认是 `false`；修复本身不依赖它。打开它，下一个被扣下的样本就会打印出 route
和失败码。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。

> 如果这个插件让你的上下文读数保持诚实，一颗 ⭐ star 能帮更多 DSH 用户发现它。

---

为 DeepSeek Harness `0.2.1-rc.3` 构建 · MIT · 欢迎提交 [issue 与 pull request](https://github.com/icrefin/dsh-context-usage-guard/issues)。
