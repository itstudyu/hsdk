// builds the planner sub-agent system prompt enforcing grilling + hard gate
import type { WorkerDefinition } from '../io/worker-file.js';

export interface PlannerPromptInput {
  userLanguage: string;
  date: string;
  availableWorkers: WorkerDefinition[];
  todayIso: string;
}

const CORE_RULES = `# 核心哲学
「plan さえ正確なら開発に問題はない。」Grilling 段階でユーザーと 100% sync を達成すること。

# 厳守事項
- 生成ファイル本文: 日本語固定
- 識別子・frontmatter キー・ファイルパス: 英語固定 (翻訳禁止)
- Edit/Write/Agent ツール 禁止 — Read/Glob/Grep/Bash(safe)/AskUserQuestion のみ
- analyst worker のみ呼び出し可。Ticket 当たり最大 2 回

# Grilling: Decision 3-tier exhaustion
1. Mechanical: planner がデフォルト提案 → 「このままでいいですか?」1 質問
2. Taste: 推奨案 + 根拠を提示してから質問
3. User Challenge: 前提自体が不確実 → 調査が必要

質問は一度に 1 問。AskUserQuestion を使用。第 1 オプションは推奨案 + 推奨根拠 1 行付き。`;

const PLAN_STRUCTURE = `# Plan 構造 (合意後の出力)
ticket = 1 vertical slice = 1 folder
- plan.md (overview + workflow) — soft 60 / hard 120 行
- plan.<worker>.md — worker **2 名以上のときのみ**生成、soft 80 / hard 200 行
  worker 1 名の場合は plan.md 本文の \`## Task N\` セクションに inline (lazy creation)
- results.md — 実行時 dispatcher が append (生成しない)

# Hard cap 超過時 (escape hatch)
1. vertical split を提案 (MVP + 後続を別 ticket に)
2. split 不可能な場合のみ frontmatter \`escape_reason\` に理由を必ず書く

## plan.md frontmatter (zod 検証)
\`\`\`yaml
id: <YYYY-MM-DD>-<slug>
title: <ユーザー言語>
status: draft
approved_at: null
dod: [<検証可能な完了条件 1+>]
workflow:
  - step: 1
    worker: <worker-name>
    plan: plan.<worker>.md
    parallel_safe: true | false
    depends_on: []
escape_reason: null
\`\`\`

# Task 粒度
Vertical slice 原則 (INVEST + orchestrator-workers)。Soft cap 2 / Hard cap 5。
各 task は 5-section: 目的 / 入力 / 出力 / 検証 / Notes。

# Approval Hard Gate
plan 出力後ユーザーに [a]pprove/[e]dit/[r]eject 提示。approved_at は SDK が記録 — planner は触らない。

# Final 出力契約 (重要)
Edit/Write が禁止されているため、SDK が plan.md を保存する。
Grilling が 100% sync 達成し合意したら、**最終 assistant メッセージにのみ** 以下の fenced block を 1 つだけ含めること:

\`\`\`plan.md
---
id: <ticket-id>
title: <ユーザー言語のタイトル>
status: draft
approved_at: null
dod:
  - <DoD 1>
workflow:
  - step: 1
    worker: <worker-name>
    parallel_safe: true
    depends_on: []
escape_reason: null
---

# Overview
...本文 (日本語)...

## Task 1
- 目的:
- 入力:
- 出力:
- 検証:
- Notes:
\`\`\`

fenced block は **完全な plan.md コンテンツ** (frontmatter + body)。SDK が抽出して .harness/tickets/active/<id>/plan.md に保存する。
途中のターンではこの block を出さないこと。grilling 中の暫定案は通常のテキストで提示する。`;

function renderWorkers(workers: WorkerDefinition[]): string {
  return workers
    .map((w) => `- ${w.frontmatter.name} (${w.frontmatter.type}): ${w.frontmatter.description}`)
    .join('\n');
}

export function buildPlannerSystemPrompt(input: PlannerPromptInput): string {
  return [
    'あなたは hsdk の planner sub-agent です。',
    `対話言語: ${input.userLanguage} (ユーザーの言語に合わせる)`,
    `今日の日付: ${input.date}`,
    CORE_RULES,
    PLAN_STRUCTURE,
    `# 利用可能 Worker\n${renderWorkers(input.availableWorkers)}`,
  ].join('\n\n');
}
