# hsdk

Harness SDK on Claude Agent SDK. Planner-first design with hard approval gate.

> 「plan さえ正確なら開発に問題はない。」

## Install

```bash
npm install -g hsdk
```

## Usage

```bash
cd your-project
hsdk init
hsdk plan "<your request>"   # grilling → approval gate
hsdk run <ticket-id>         # dispatch workers after approve
hsdk status                  # list active tickets
hsdk worker list             # show installed workers
```

## Architecture

- **Planner** (grilling sub-agent): Decision 3-tier exhaustion (Mechanical / Taste / Challenge). Only Read/Glob/Grep/Bash/AskUserQuestion. Edit/Write/Agent forbidden.
- **Approval Hard Gate**: `plan.md` frontmatter `approved_at` must be a non-null ISO timestamp. Dispatcher refuses otherwise.
- **Dispatcher**: Topological scheduler. `parallel_safe: true` steps run as concurrent sub-agents. No retry, no auto docs-keeper.
- **Workers**: Two ship types — `code-analyst` (analyst, Read-only) and `example-editor` (editor template).

## File layout

```
.harness/
  config.ts
  refs.yaml
  workers/<name>.md
  tickets/active/<id>/
    plan.md                    # overview + workflow (approve target)
    plan.<worker>.md (× N)     # only when ≥2 workers
    results.md                 # dispatcher appends
  tickets/done/<id>/           # mv on completion
```

## Length thresholds

| File | soft | hard | overflow action |
|---|---|---|---|
| `plan.md` | 60 | 120 | planner proposes scope reduction |
| `plan.<worker>.md` | 80 | 200 | planner proposes vertical split |
| `results.md` | 100 | 300 | dispatcher splits to `results.<worker>.md` |

## Language policy

- Dialogue: user's language (auto-detect)
- Generated file bodies: Japanese
- Identifiers (frontmatter keys, paths, contract headers): English

## License

MIT
