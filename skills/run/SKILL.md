---
name: run
description: "/hsdk:run [ticket-id]로 승인된 plan을 실행한다. plan.md frontmatter의 approved_at != null을 hard gate로 검증 (미승인 시 즉시 거부 + /hsdk:plan 안내). 통과 시 workflow를 토포소트하여 parallel_safe + depends_on 완료 step들을 동시 sub-agent dispatch. 각 worker 결과를 results.md에 sequential append. 실패 시 즉시 status: blocked + 사용자 보고 (retry 없음). 전체 완료 시 status: done, .harness/tickets/done/<id>/ 로 mv."
when_to_use: "/hsdk:plan으로 승인된 ticket을 실제 실행할 때. 미승인 ticket에 대해서는 작동하지 않음."
allowed-tools: Agent, Read, Edit, Write, Glob, Grep, Bash
model: opus
---

# /hsdk:run — Hard Gate + Worker Dispatch

## 트리거

```
/hsdk:run              # active 티켓이 1개면 자동 선택
/hsdk:run <ticket-id>  # 명시 지정
```

## Step 0. ticket 식별

```bash
if [ -z "$ARG_ID" ]; then
  COUNT=$(ls -1 .harness/tickets/active/ 2>/dev/null | grep -v '^\.' | wc -l | tr -d ' ')
  if [ "$COUNT" -eq 0 ]; then
    echo "NO_ACTIVE_TICKETS"
  elif [ "$COUNT" -eq 1 ]; then
    ID=$(ls -1 .harness/tickets/active/ | grep -v '^\.' | head -1)
    echo "ID=$ID"
  else
    echo "AMBIGUOUS"
  fi
else
  ID="$ARG_ID"
  [ -d ".harness/tickets/active/$ID" ] && echo "ID=$ID" || echo "NOT_FOUND"
fi
```

- `NO_ACTIVE_TICKETS` → "active 티켓이 없습니다. `/hsdk:plan`으로 시작하세요." 후 종료
- `AMBIGUOUS` → active 목록 출력 후 종료, ticket-id 명시 요청
- `NOT_FOUND` → 입력 id가 active에 없음 → 종료

## Step 1. Hard Approval Gate

```bash
APPROVED_AT=$(awk '/^approved_at:/{print $2; exit}' .harness/tickets/active/$ID/plan.md)
STATUS=$(awk '/^status:/{print $2; exit}' .harness/tickets/active/$ID/plan.md)
```

다음 중 하나라도 해당 시 **즉시 거부**:

- `APPROVED_AT == null` 또는 빈 값 → "이 ticket은 아직 승인되지 않았습니다. `/hsdk:plan` 결과의 [a]pprove 게이트를 통과시키세요."
- `STATUS == draft` → 같은 메시지
- `STATUS == done` → "이 ticket은 이미 완료되어 있습니다 (.harness/tickets/done/$ID 확인)."
- `STATUS == blocked` → "이전 실행이 blocked 상태입니다. plan.md를 검토 후 재개 여부를 결정하세요."

**editor worker dispatch는 위 게이트 통과 후에만 허용** — spec B3.

### Step 1.5. 길이 hard cap 재검증 (spec C 방어선)

plan skill 의 Step 2.0 와 동일 로직을 다시 한 번 검사 (frontmatter 손편집 / 직접 git 조작으로 plan 단계를 우회한 케이스 방어):

```bash
PLAN=".harness/tickets/active/$ID/plan.md"
PLAN_LINES=$(wc -l < "$PLAN" | tr -d ' ')
ESCAPE=$(awk '/^escape_reason:/{print $2; exit}' "$PLAN")
VIOLATIONS=""

[ "$PLAN_LINES" -gt 120 ] && { [ -z "$ESCAPE" ] || [ "$ESCAPE" = "null" ]; } \
  && VIOLATIONS="$VIOLATIONS plan.md($PLAN_LINES)"

for f in .harness/tickets/active/$ID/plan.*.md; do
  [ -f "$f" ] || continue
  L=$(wc -l < "$f" | tr -d ' ')
  [ "$L" -gt 200 ] && { [ -z "$ESCAPE" ] || [ "$ESCAPE" = "null" ]; } \
    && VIOLATIONS="$VIOLATIONS $(basename $f)($L)"
done

[ -n "$VIOLATIONS" ] && echo "HARD_CAP_VIOLATION:$VIOLATIONS"
```

`HARD_CAP_VIOLATION` 검출 시 즉시 거부 (사용자 언어):

> "plan 파일이 hard cap 을 초과했고 `escape_reason` 이 비어있습니다 ($VIOLATIONS). `/hsdk:plan` 으로 돌아가 split 하거나 escape_reason 을 기입한 뒤 다시 시도하세요."

dispatch X. status 변경 X.

## Step 2. status: ready → wip 전이

```bash
# plan.md frontmatter Edit: status: ready → status: wip
# started_at 추가 (frontmatter top)
```

```yaml
status: wip
started_at: <ISO 8601>
approved_at: <기존값 유지>
```

## Step 3. workflow 로드 + 토포소트

plan.md frontmatter의 `workflow:` 를 파싱 (gray-matter 호환 YAML):

```yaml
workflow:
  - step: 1
    worker: code-analyst
    parallel_safe: true
    depends_on: []
  - step: 2
    worker: example-editor
    plan: plan.example-editor.md
    parallel_safe: false
    depends_on: [1]
```

토포소트하여 실행 순서 결정. 모든 `depends_on` 이 완료된 `parallel_safe: true` step들은 **단일 메시지의 multiple Agent 호출로 동시 dispatch**.

## Step 4. Worker dispatch

각 step에 대해:

### 4.1 worker definition 검증

```bash
WORKER=<step.worker>
[ -f ".claude/agents/workers/$WORKER.md" ] || echo "MISSING_WORKER=$WORKER"
```

worker 파일 없으면 즉시 `status: blocked` + 사용자 보고.

### 4.2 plan injection 결정

- worker 1명만 있는 ticket → `plan.md` 본문의 `## Task N` 섹션을 추출하여 inject
- worker 2명 이상 → `plan.<worker>.md` 를 그대로 inject

### 4.3 per-worker refs 주입 (auto-load mode 별 분기 — spec F)

`.harness/refs.yaml` 의 `per-worker.<WORKER>` 항목을 읽어 References 블록을 합성. **auto-load 모드 별로 분기**:

| 모드 | 동작 |
|---|---|
| `always` | 무조건 References 블록에 포함 |
| `conditional` | `keywords:` 중 하나라도 worker 의 plan 본문 (plan.\<worker\>.md 또는 plan.md 의 ## Task N) 에 含まれる場合のみ포함. case-insensitive grep |
| `manual` | dispatcher는 포함しない (사용자 명시 요청 시만 — run skill 에서는 무視) |

```bash
WORKER_PLAN=".harness/tickets/active/$ID/plan.$WORKER.md"
[ -f "$WORKER_PLAN" ] || WORKER_PLAN=".harness/tickets/active/$ID/plan.md"

# refs.yaml をパースして per-worker.<WORKER> の各 entry を分岐評価
# (実装は yq か Python の yaml モジュール、もしくは awk + grep の組合せ)
# 出力: REFS_BLOCK="- /abs/path1\n- /abs/path2\n..."
```

마무리 — `REFS_BLOCK` が空なら References 헤더 자체를 omit. defaults/user-defined の always ref も同じルールで合成 (planner 段階で既に Read 済みでも、worker prompt にパス自体を渡すと worker 側で再 Read 可能)。

### 4.4 Agent 호출 (upstream 참조 inject 포함)

먼저 현재 step 의 `depends_on` 목록을 frontmatter 에서 추출하고, 그 step들의 results.md 섹션 경로를 모은다 (revfactory team-examples §4 패턴):

```bash
DEPS=$(awk '/^  - step: '"$STEP_N"'$/,/^  - step: /' .harness/tickets/active/$ID/plan.md \
  | awk -F'[][]' '/^[[:space:]]*depends_on:/{print $2}' | tr ',' ' ')

UPSTREAM_BLOCK=""
for d in $DEPS; do
  # results.md / results.<worker>.md 어느 쪽에 있는지 grep 으로 위치 확인
  for f in .harness/tickets/active/$ID/results.md .harness/tickets/active/$ID/results.*.md; do
    [ -f "$f" ] || continue
    if grep -q "^## Step $d — " "$f"; then
      UPSTREAM_BLOCK="$UPSTREAM_BLOCK\n- @$f (## Step $d — <upstream-worker> 섹션 참조)"
      break
    fi
  done
done
```

worker prompt 합성 — 두 영문 contract header 를 모두 사용. `description` には plan.\<worker\>.md の `## Task N` ヘッダ直下の 1 行 (Why) を **そのまま** 抜き出して入れる (例: `"認証 middleware の token 漏洩を修正"` のように具体的に。`"task 한 줄 요약"` のようなメタ表現は禁止):

```
Agent(
  description="認証 middleware の token 漏洩を修正",
  subagent_type="example-editor",
  prompt="@.harness/tickets/active/$ID/plan.$WORKER.md\n\n## References for upstream\n- @.harness/tickets/active/$ID/results.md (## Step 1 — code-analyst 섹션 참조)\n\n## References for this worker\n- /abs/path/to/coding-rule.md"
)
```

> **`## References for upstream` 및 `## References for this worker` 헤더는 영문 그대로 유지** — worker contract (workers 가 영문 헤더를 grep). 일본어화 금지.
> upstream / this-worker 의 차이: **upstream** 은 동일 ticket 안의 선행 step 산출물 (results.md 의 해당 섹션), **this-worker** 는 refs.yaml 의 per-worker / always 문서 (정적 참조). `UPSTREAM_BLOCK` 이 빈 경우 (depends_on 이 빈 배열) `## References for upstream` 헤더 자체를 omit.

독립 step(`depends_on` 모두 완료 + `parallel_safe: true`)은 **단일 메시지에서 multiple Agent 동시 호출**. 의존 step은 순차.

### 4.5 Worker output contract 検証 (§E6 self-verify section 存在チェック)

각 worker 응답 본문 (`$WORKER_OUTPUT`) 에 대해 **section 存在レベル**でのみ検証 (内容パースしない):

```bash
# 必須 section 2 個 (spec H Worker 本文 4-section の Output Format 部分)
HAS_RESULT=$(grep -c '^## Result[[:space:]]*$' <<< "$WORKER_OUTPUT")
HAS_DOD=$(grep -c '^## DoD verification[[:space:]]*$' <<< "$WORKER_OUTPUT")

CONTRACT_VIOLATIONS=""
[ "$HAS_RESULT" -eq 0 ] && CONTRACT_VIOLATIONS="$CONTRACT_VIOLATIONS '## Result'"
[ "$HAS_DOD" -eq 0 ] && CONTRACT_VIOLATIONS="$CONTRACT_VIOLATIONS '## DoD verification'"

if [ -n "$CONTRACT_VIOLATIONS" ]; then
  echo "CONTRACT_VIOLATION: worker=$WORKER missing sections:$CONTRACT_VIOLATIONS"
fi
```

> spec E6: 内容 parser は持たない。section 自体の **存在** のみが contract。チェックボックスの内訳・DoD 項目数までは検査しない (簡潔さ最優先)。

`CONTRACT_VIOLATION` 검출 시 — **Step 6 (failure 처리) と同じ扱い**:

1. plan.md `status: wip → blocked`
2. results.md に worker output を**そのまま append** (Step 5 を実行) + 末尾に `<!-- CONTRACT_VIOLATION: <details> -->` コメント追加
3. 사용자에게 즉시 보고 (사용자 언어): 위반 sections, 후속 step dispatch 중지

editor worker (`type: editor`) は加えて `## Files changed` の存在も検査 — 不在は `partial` 相当として記録するが blocked にはしない (editor が「変更なし」と判定した正当ケースを許容)。

## Step 5. 결과 집계 (300 行 hard cap で auto-split)

각 worker 응답 append 직전에 라우팅 결정:

```bash
TARGET=".harness/tickets/active/$ID/results.md"
CUR_LINES=0
[ -f "$TARGET" ] && CUR_LINES=$(wc -l < "$TARGET" | tr -d ' ')

# 既存 results.md が 300 行を超えていれば、この worker 専用ファイルへ分離
if [ "$CUR_LINES" -gt 300 ]; then
  TARGET=".harness/tickets/active/$ID/results.$WORKER.md"
fi

cat >> "$TARGET" << EOF
## Step $N — $WORKER ($COMPLETED_ISO)

$WORKER_OUTPUT

---
EOF

# append 後にもう一度測定。今回の append でしきい値を越えたなら、
# 次の worker から自動的に results.$NEXT_WORKER.md に書く合図として
# results.md の末尾に分離マーカーを 1 行残す。
POST_LINES=$(wc -l < "$TARGET" | tr -d ' ')
if [ "$TARGET" = ".harness/tickets/active/$ID/results.md" ] && [ "$POST_LINES" -gt 300 ]; then
  echo "<!-- results.md exceeded 300 lines; subsequent workers split to results.<worker>.md -->" >> "$TARGET"
fi
```

> spec C 길이 임계: `results.md` soft 100 / hard 300. hard 초과 후의 worker 결과는 `results.<worker>.md` 로 자동 분리. 既存 results.md は維持 (削除しない、過去結果の保全のため)。最終ユーザー報告では results.md と results.\<worker\>.md の両方を案内する。

## Step 6. 실패 처리 (retry 없음)

worker 응답 본문에서 `## Result` 헤더 **바로 다음 줄**(공백 trim 후)이 `failure`인 경우, 또는 응답 자체 실패(Agent 호출 에러)인 경우:

검출 패턴 (예시 awk):

```bash
RESULT=$(awk '/^## Result[[:space:]]*$/{getline; gsub(/^[[:space:]]+|[[:space:]]+$/,"",$0); print; exit}' <<< "$WORKER_OUTPUT")
# RESULT = success | partial | failure
```

> 워커 contract (spec H): `## Result` 헤더와 값이 **별개 줄**로 분리되어 있다. `## Result: failure` 같은 한 줄 형태로 매칭하면 영원히 false negative가 발생하므로 금지.

`failure` 검출 시:

1. plan.md frontmatter `status: wip → status: blocked` (Edit)
2. 사용자에게 **즉시 보고** (사용자 언어): 실패한 step, 사유, 다음 액션 (plan.md 수정 후 재실행 / 폐기)
3. **retry 하지 않음** — spec D2

`partial` 검출 시: success와 동일하게 후속 step 진행하되, 최종 보고에 partial 표시. 사용자가 추가 작업이 필요한지 판단.

후속 step은 dispatch하지 않음 (failure 시).

## Step 7. 전체 완료 처리

모든 step `success`:

1. plan.md frontmatter `status: wip → status: done` (Edit)
2. `mv .harness/tickets/active/$ID .harness/tickets/done/$ID`
3. 사용자 보고 (사용자 언어): 완료 step 수, results.md 경로, 변경 파일 요약

## Step 8. docs-keeper / log.md 없음 (Simplicity First)

hsdk는 자동 docs 갱신, log.md 기록을 하지 않는다. 사용자가 필요 시 별도 도구로 처리.

## 언어 정책

- 사용자 보고: 사용자 언어
- Agent prompt 본문 (description 포함): 일본어
- contract 식별자 (`phase=*`, `## References for this worker`, `## Result`, `## Files changed`, `## DoD verification`, frontmatter key): **영문 고정**
- results.md 본문: 일본어 (worker 응답을 그대로 보존 — worker가 일본어 출력 보장)

## Negative Space

- ❌ `approved_at == null` 상태에서 editor worker dispatch — hard gate violation
- ❌ retry 로직 추가 — 실패는 즉시 blocked
- ❌ workflow에 없는 worker를 호출
- ❌ analyst worker로 Edit/Write 시도 (worker 자체가 거부하지만 dispatch 단계에서도 frontmatter `type: analyst` 검증)
- ❌ docs-keeper 자동 호출 — spec I
- ❌ `.harness/log.md` 갱신
- ❌ 사용자 확인 없이 blocked → 재시도
- ❌ Worker 응답에 `## Result` / `## DoD verification` section 누락 — Step 4.5 contract 검증 우회 금지 (§E6)
- ❌ `## DoD verification` 의 **내용** 까지 파싱 — section 존재 레벨만 (§E6 軽量化 原則)

## Self-Verification (existence + cross-check, revfactory qa-agent-guide §3-2)

종료 전 — 존재 확인뿐 아니라 **교차 비교** 까지 통과시킬 것:

**존재 확인**:
1. plan.md status가 `done` 또는 `blocked` 둘 중 하나인가 (`wip` 잔존 금지)
2. done 시 ticket이 `done/` 에 이동했는가
3. results.md에 모든 step의 결과가 기록됐는가
4. 실패 보고 시 사용자에게 명확한 다음 액션을 제시했는가
5. CONTRACT_VIOLATION 검출 시 사용자 보고 + status: blocked 가 모두 일어났는가 (§E6)

**교차 비교 (cross-check)**:
6. results.md (+ results.\<worker\>.md split) 의 `## Step N — <worker>` 헤더가 frontmatter `workflow[].step` 번호 + worker 와 **byte-level 일치**하는가
7. dispatch 한 worker 수 = frontmatter `workflow:` step 수 (failure 로 인한 abort 케이스 제외) **일치**하는가
8. `depends_on` 위반 (선행 step 미완료 상태에서 후속 step dispatch) 이 0건인가
