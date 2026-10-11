## Summary / 概述

<!-- What changed and why. Link the issue: Closes #123 -->
<!-- 改了什么、为什么改。关联 issue：Closes #123 -->

## Type of change / 变更类型

- [ ] Bug fix / 缺陷修复
- [ ] New feature / 新功能
- [ ] Breaking change / 破坏性变更
- [ ] Refactor or performance / 重构或性能
- [ ] Documentation or examples / 文档或示例
- [ ] CI, build, or dependencies / CI、构建或依赖

## Which half does this touch? / 影响哪一半？

- [ ] Host half — `src/index.ts`, `src/guard.ts` (the `llm/stream` listener)
- [ ] Browser half — `src/client/*` (the stylesheet rule)
- [ ] Both / 两半都有
- [ ] Neither (docs, CI, tests) / 都不是（文档、CI、测试）

## How it was verified / 验证方式

<!-- Exact commands, test names, or steps a reviewer can repeat. -->
<!-- 评审者可复现的确切命令、测试名称或步骤。 -->

```bash
# pnpm check                 # tsc, host half + client half, then vitest
# pnpm test                  # vitest alone: 40 tests in 5 suites
# node tools/preview.mjs     # optional: render and screenshot the footer
```

## Checklist / 检查清单

- [ ] Tested locally, and the commands above pass / 已在本地测试，且上述命令通过
- [ ] Tests added or updated for behavior changes / 行为变更已新增或更新测试
- [ ] `lib/` rebuilt and committed for a change to either half / 两半之一有改动时已重建并提交 `lib/`
- [ ] Docs updated (README, README.zh-CN, TSDoc comments, `docs/`) / 文档已更新（README、README.zh-CN、TSDoc 注释、`docs/`）
- [ ] `docs/images/context-usage-ring.png` regenerated if the meter's typography changed / 若 meter 排版变化，已重新生成 `docs/images/context-usage-ring.png`
- [ ] No secrets committed — no API keys, tokens, passwords, private keys, `.env` files, or personal data / 未提交任何密钥 —— 无 API key、令牌、密码、私钥、`.env` 文件或个人数据
- [ ] License of new dependencies checked and compatible with `MIT` / 已核查新增依赖的许可证，且与本项目的 `MIT` 兼容
- [ ] Commits carry a `Signed-off-by:` line (`git commit -s`) / 提交带有 `Signed-off-by:` 行（`git commit -s`）
- [ ] Pull request targets `main` and is rebased on its latest commit / PR 目标分支为 `main`，且已 rebase 到其最新提交

## Screenshots or logs (optional) / 截图或日志（可选）

<!-- Remove anything sensitive before pasting — crop a footer screenshot to the
     figures, and never paste a session body, a real path, or a host name. -->
<!-- 粘贴前请先删除敏感内容 —— footer 截图请裁到只剩数字，切勿粘贴会话正文、
     真实路径或主机名。 -->

## Notes for reviewers / 给评审者的说明

<!-- Tradeoffs, follow-up work, or parts you are unsure about. -->
<!-- 取舍、后续工作，或你不确定的部分。 -->
