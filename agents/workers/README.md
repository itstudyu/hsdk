# hsdk workers

This directory ships two **default workers** that `/hsdk:init` copies into your project's `.claude/agents/workers/`:

| Worker | Type | 用途 |
|---|---|---|
| `code-analyst.md` | analyst | Read/Glob/Grep/Bash のみ。Grilling 中に planner が呼び出し可能 (ticket あたり最大 2 回) |
| `example-editor.md` | editor | コピーして編集するためのテンプレート。domain/tools を調整して使う |

## Worker frontmatter contract

```yaml
name: <string>
type: analyst | editor          # analyst は Edit/Write 不可
description: <string>
tools: [Read, Glob, Grep, ...]  # analyst に Edit/Write を入れると dispatcher が拒否
model: haiku | sonnet | opus
maxTurns: <number>
```

## Worker 本文 4-section

1. **Core Identity** — 何をする worker か
2. **Self-Verification** — 完了報告前の確認手順
3. **Negative Space** — 絶対にしないこと (Surgical Changes / scope 逸脱禁止 等)
4. **Output Format**
   - `## Result`: `success | partial | failure`
   - `## Files changed`: `<path>: <reason>` (editor のみ)
   - `## DoD verification`: チェックボックス (section の **存在** が contract)
   - `## Notes`: dispatcher へのメモ (自由記述)

## Adding a new worker

1. `agents/workers/<name>.md` を新規作成 (上記 contract 準拠)
2. `/hsdk:init` でこの worker が含まれる新規プロジェクトに配布、または既存プロジェクトの `.claude/agents/workers/` に直接コピー
3. planner が `suggested_worker: <name>` を plan.md `workflow:` に書けるようになる
