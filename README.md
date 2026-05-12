# hsdk

Speed-first harness for Claude Code. Planner-first design with hard approval gate.

> 「plan さえ正確なら開発に問題はない。」

Shipped as a **Claude Code plugin** (no CLI, no npm install). Skills run inside your existing Claude Code session so planner grilling stays in the prompt cache window and sub-agent dispatch is native.

## Install

Inside Claude Code, run these two commands in order:

```
/plugin marketplace add itstudyu/hsdk
/plugin install hsdk@hsdk
```

The first command registers this GitHub repository as a single-plugin marketplace (the repo ships its own `.claude-plugin/marketplace.json`). The second installs the `hsdk` plugin from that marketplace. The `@hsdk` suffix disambiguates if you have multiple marketplaces registered.

### Update later

```
/plugin marketplace update hsdk
/plugin install hsdk@hsdk
```

### Local development install (optional)

```bash
cd ~/.claude/plugins/local
git clone https://github.com/itstudyu/hsdk.git
```

Then in any target project:

```
/hsdk:init                          # 1회만 — .harness/, refs.yaml, default workers 설치
/hsdk:plan "<your request>"         # grilling → plan.md (draft) → approval gate
/hsdk:run [<ticket-id>]             # approved_at 검증 후 worker dispatch
/hsdk:status                        # active 티켓 + 다음 액션
/hsdk                               # 라우터 (현재 상태만 보고. 인자 호출 미지원)
```

> `/hsdk` 라우터는 **인자 없이만** 호출하세요. `/hsdk "fix bug"` 처럼 인자를 주면 명확히 거부하고 `/hsdk:plan` 을 직접 쓰라고 안내합니다. 라우터의 역할은 (a) 부트스트랩 확인, (b) active 티켓 상태 보고, (c) 다음 액션 안내 3 가지에 한정됩니다.

## Usage flow

```
┌──────────────┐    ┌──────────────────────────┐    ┌──────────────┐    ┌──────────┐
│ /hsdk:init   │───▶│ /hsdk:plan "<your req>"  │───▶│ /hsdk:run    │───▶│ done/    │
│ (1 회만)     │    │ grilling → draft         │    │ workers      │    │ 로 mv    │
└──────────────┘    │ → 최종 plan 출력         │    │ dispatch     │    └──────────┘
                    │ → [a]pprove / [e]dit /   │    │ → results.md │
                    │   [r]eject 게이트        │    └──────────────┘
                    └──────────────────────────┘
                                  │
                                  ├── [a] approve → approved_at: <ISO> 기록, /hsdk:run 으로 진행 가능
                                  ├── [e] edit    → 피드백 받아 planner refine 후 다시 게이트
                                  └── [r] reject  → ticket 폐기 (rm -rf)
```

**Hard gate**: `/hsdk:run` 은 `plan.md` frontmatter `approved_at != null` 검증을 통과해야 worker dispatch 합니다. `[a]pprove` 안 거치면 영구히 dispatch 불가.

## Architecture

- **Planner** (`agents/planner.md`, sub-agent): Decision 3-tier exhaustion (Mechanical / Taste / User Challenge). Tools = `Read, Glob, Grep, Bash, AskUserQuestion, Edit, Write`. `Agent` forbidden — analyst dispatch is the skill body's job.
- **Approval Hard Gate**: `plan.md` frontmatter `approved_at` must be a non-null ISO timestamp. `/hsdk:run` refuses dispatch otherwise.
- **Dispatcher** (skill body of `/hsdk:run`): Topological scheduler. `parallel_safe: true` steps run as concurrent sub-agents in a single message. **No retry**, no auto docs-keeper, no log.md.
- **Workers**: Two ship types — `code-analyst` (analyst, Read-only) and `example-editor` (editor template). User-defined workers go in `.claude/agents/workers/<name>.md`.

## File layout (target project after `/hsdk:init`)

```
.harness/
  refs.yaml
  tickets/active/<id>/
    plan.md                    # overview + workflow (approve target)
    plan.<worker>.md (× N)     # only when ≥2 workers
    results.md                 # dispatcher appends
  tickets/done/<id>/           # mv on completion

.claude/agents/workers/
  code-analyst.md              # shipped
  example-editor.md            # shipped
  <your-worker>.md             # user-defined
```

## Length thresholds

| File | soft | hard | overflow action |
|---|---|---|---|
| `plan.md` | 60 | 120 | planner proposes scope reduction |
| `plan.<worker>.md` | 80 | 200 | planner proposes vertical split |
| `results.md` | 100 | 300 | dispatcher splits to `results.<worker>.md` |

Hard cap overflow requires `escape_reason` in plan.md frontmatter.

## Language policy

- Dialogue: user's language (auto-detect from latest message)
- Generated file bodies (plan.md, results.md): **Japanese**
- Identifiers (frontmatter keys, paths, `phase=draft`/`phase=refine`, `## References for this worker`, `## References for upstream`, `## DoD verification`, `## Result`, `## Files changed`, `suggested_worker`): **English, never translated**

## Intentionally dropped vs hfx

4-signal worker scoring, commander sub-agent, retry on worker failure, auto docs-keeper, status.md sentinel file, APPROVED sentinel, tasks/ folder, artifacts/ folder, log.md, backlog.md, pre-commit hook, mirror sync. The rationale lives in skill bodies' Negative Space sections (`skills/plan/SKILL.md`, `skills/run/SKILL.md`) and the planner's anti-pattern list (`agents/planner.md`).

## Why a plugin instead of a CLI

hsdk was originally specced as `npm i -g hsdk` with `commander` sub-commands. It pivoted to plugin-only because:

1. **Cache hit rate** — planner grilling spans 3–5 turns. Each CLI invocation is a cold start that re-sends the system prompt; plugin mode keeps the 5-minute prompt cache warm, cutting tokens ~3–4×.
2. **Grilling UX** — `AskUserQuestion` with options/previews is native to Claude Code. A CLI would re-implement this with readline.
3. **Sub-agent dispatch** — planner → analyst → editor handoff stays inside one Claude session. CLI mode would have to serialize state through `plan.md` only.
4. **No CI/batch demand** — usage is interactive. The CLI surface added complexity without a customer.

The legacy TypeScript implementation is preserved in `legacy/` for reference.

## License

MIT
