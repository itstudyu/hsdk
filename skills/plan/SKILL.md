---
name: plan
description: "/hsdk:plan <요구>로 새 작업 계획을 세운다. planner sub-agent를 dispatch → 3-tier grilling으로 100% sync → plan.md (status: draft, approved_at: null) 작성 → 최종 plan을 사용자에게 출력 → 명시적 [a]pprove / [e]dit / [r]eject 게이트. 승인 시 approved_at에 ISO timestamp 기록 + status: ready 전이. 미승인은 즉시 종료 (draft 상태로 유지)."
when_to_use: "사용자가 새 기능 추가, 버그 수정, 리팩토링 작업을 시작하려 할 때. /hsdk:run 전에 반드시 통과해야 하는 hard approval gate."
allowed-tools: Agent, Read, Edit, Write, Glob, Grep, Bash, AskUserQuestion
model: opus
---

# /hsdk:plan — Planning + Grilling + Hard Approval Gate

## 트리거

```
/hsdk:plan <자연어 요구>
```

## Step 0. 부트스트랩 가드

```bash
if [ ! -f .harness/refs.yaml ]; then
  echo "BOOTSTRAP_NEEDED=missing"
elif ! grep -q "^bootstrapped:[[:space:]]*true" .harness/refs.yaml; then
  echo "BOOTSTRAP_NEEDED=incomplete"
else
  echo "BOOTSTRAP_NEEDED=no"
fi
```

`BOOTSTRAP_NEEDED ≠ no`이면 **사용자 언어**로 1줄 안내 후 종료:

> "이 프로젝트는 아직 hsdk 부트스트랩이 안 됐습니다. `/hsdk:init`을 먼저 실행하세요."

## Step 1. Planner draft 호출

```
Agent(
  description="<요구 한 줄 요약> の plan draft 作成",
  subagent_type="planner",
  prompt="phase=draft\n\n<사용자 요구 원문>\n\n参照ポリシー (spec F):\n- .harness/refs.yaml の `auto-load: always` 項目は全て Read してから開始せよ\n- `auto-load: conditional` 項目は、grilling 中に確定するスコープ/task 本文の中に `keywords:` のいずれかが含まれる場合のみ Read。マッチしなければ無視\n- `auto-load: manual` 項目はユーザーが明示要求しない限り読まない"
)
```

planner가:
1. refs.yaml 로드 → `auto-load: always` 문서 Read
2. 코드베이스 탐색
3. AskUserQuestion으로 3-tier grilling
4. (grilling 중·후) `auto-load: conditional` ref 의 `keywords` 와 현재 task 본문을 매칭. 매칭 시 해당 ref 도 Read 하고 plan 작성에 반영
4. `.harness/tickets/active/<id>/plan.md` 작성 (`status: draft`, `approved_at: null`)
5. analyst가 필요하면 plan.md에 `## Open questions for planner` 섹션 작성 후 `status: draft`로 일단 종료

## Step 1.5. (조건부) analyst dispatch + planner refine

planner가 반환한 plan.md를 Read해서 분기 (planner가 생성한 ticket-id를 `$ID`로 보유):

```bash
ID=$(ls -1t .harness/tickets/active/ | grep -v '^\.' | head -1)
STATUS=$(awk '/^status:/{print $2; exit}' ".harness/tickets/active/$ID/plan.md")
HAS_OPEN_Q=$(grep -c "^## Open questions for planner" ".harness/tickets/active/$ID/plan.md" || true)
```

- `STATUS == draft` AND `HAS_OPEN_Q > 0` → **analyst dispatch 후 planner refine 호출**
- 그 외 (`STATUS == draft` AND no open questions, 또는 즉시 `status: ready`) → Step 2로

### analyst 호출 (ticket당 최대 2회)

```
Agent(
  description="planner の open questions 調査",
  subagent_type="code-analyst",
  prompt="@.harness/tickets/active/$ID/plan.md\n\n## Open questions for planner 섹션을 読み、各質問に file:line 引用で答えよ。推測禁止。"
)
```

analyst 결과를 plan.md에 `## Analysis result (round N)` 섹션으로 append.

### planner refine 호출

```
Agent(
  description="<요구> の plan refine",
  subagent_type="planner",
  prompt="phase=refine\n\n@.harness/tickets/active/$ID/plan.md\n\n直前の Analysis result セクションを読んで残った分岐を解消し、status: ready に進めよ"
)
```

refine 후에도 `status == draft`이면 한 번 더 analyst 라운드 가능 (총 2회까지). 2회 후에도 ready 도달 못하면 사용자에게 정직 보고 + 스코프 재조정 제안 후 종료.

## Step 2. 최종 plan 출력 + Hard Approval Gate

`status: ready` 도달 후:

### 2.0 길이 임계 검증 (spec C, hard cap)

```bash
PLAN=".harness/tickets/active/$ID/plan.md"
PLAN_LINES=$(wc -l < "$PLAN" | tr -d ' ')
ESCAPE=$(awk '/^escape_reason:/{print $2; exit}' "$PLAN")

# plan.md hard cap = 120 行
if [ "$PLAN_LINES" -gt 120 ] && { [ -z "$ESCAPE" ] || [ "$ESCAPE" = "null" ]; }; then
  echo "HARD_CAP_VIOLATION=plan.md ($PLAN_LINES lines, no escape_reason)"
fi

# 各 plan.<worker>.md hard cap = 200 行
for f in .harness/tickets/active/$ID/plan.*.md; do
  [ -f "$f" ] || continue
  L=$(wc -l < "$f" | tr -d ' ')
  if [ "$L" -gt 200 ] && { [ -z "$ESCAPE" ] || [ "$ESCAPE" = "null" ]; }; then
    echo "HARD_CAP_VIOLATION=$f ($L lines, no escape_reason)"
  fi
done
```

`HARD_CAP_VIOLATION` 이 1건이라도 검출되면 **승인 게이트로 진행 X**. 사용자 언어로 다음을 보고하고, planner 를 `phase=refine` 으로 다시 호출:

> "plan.md (또는 plan.\<worker\>.md) 가 hard cap (120 / 200 행) 을 초과했고 `escape_reason` 이 비어있습니다. planner 가 vertical split 을 제안하거나, vertical split 불가능 시 `escape_reason` 을 채워야 진행 가능합니다."

planner refine 호출 prompt 에 `HARD_CAP_VIOLATION` 정보 포함. refine 후 다시 Step 2.0 부터 재검증.

### 2.1 사용자 표시 + 승인 게이트

1. plan.md 전체를 Read하여 사용자에게 출력
2. worker가 2명 이상이면 각 `plan.<worker>.md`도 출력
3. AskUserQuestion으로 승인 게이트:

```
Q: 이 plan으로 진행하시겠습니까?
  [a] approve — approved_at 기록 후 /hsdk:run 으로 진행 가능
  [e] edit — 어디를 고칠지 알려주세요 (다시 planner 호출)
  [r] reject — ticket 폐기
```

### [a] approve 처리

```bash
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Edit: plan.md frontmatter `approved_at: null` → `approved_at: <TS>`
# status は ready のまま据え置く。承認可否は **approved_at の非 null** で単一判定する (status に approved 値を作らない)。
```

Edit으로 surgical 교체. 보고: "승인 완료. `/hsdk:run <id>` 로 dispatch 가능합니다."

### [e] edit 처리

사용자에게 무엇을 바꿀지 자유 입력 받고, planner를 다시 호출:

```
Agent(
  description="<요구> の plan 修正 (フィードバック反映)",
  subagent_type="planner",
  prompt="phase=refine\n\n@.harness/tickets/active/$ID/plan.md\n\nユーザーフィードバック:\n<피드백 본문>\n\n反映後 status: ready で再提示せよ"
)
```

피드백 반영 후 다시 Step 2 (출력 + 승인 게이트).

### [r] reject 처리

```bash
rm -rf ".harness/tickets/active/$ID"
```

보고: "ticket 폐기. 새로 시작하려면 다시 `/hsdk:plan`."

## Step 3. 종료 보고 (사용자 언어)

- approve 시: ticket id, plan.md 경로, 다음 명령 (`/hsdk:run <id>`)
- edit/reject 시: 현재 상태와 다음 액션

## 언어 정책

- 사용자 대화 / 보고: 사용자 언어
- planner 호출 prompt 본문: 일본어 (단 `phase=draft`/`phase=refine`, frontmatter key 등 contract는 영문 고정)
- plan.md / plan.<worker>.md 본문: 일본어 (planner가 보장)

## Negative Space

- ❌ planner를 거치지 않고 직접 plan.md를 작성 — planner sub-agent 격리 의무
- ❌ `approved_at`을 사용자 명시 승인 없이 기록 — hard gate violation
- ❌ analyst 3회 이상 호출 — grilling 방향성 오류 신호
- ❌ status가 draft인 상태로 종료하지 않고 강제로 ready 전환
- ❌ `Edit/Write`로 plan.md 본문을 직접 수정 (frontmatter approved_at 기록은 예외)

## Self-Verification (existence + cross-check, revfactory qa-agent-guide §3-2)

종료 전 — **약한 체크 (존재 확인) 와 강한 체크 (교차 비교)** 를 함께 만족시킬 것:

**존재 확인**:
1. plan.md가 존재하는가
2. status가 `ready`이고 approved_at이 (a 선택 시) ISO timestamp인가
3. workflow의 각 worker가 `.claude/agents/workers/<name>.md`에 실재하는가 (Glob 확인)
4. plan.md가 soft cap 60줄 이내인가 (초과 시 경고만, planner 책임)

**교차 비교 (cross-check)**:
5. plan.md `## Task N` 섹션 개수 = frontmatter `workflow:` step 수와 **일치**하는가
6. 각 `## Task N` 의 `suggested_worker:` 값이 frontmatter `workflow[step=N].worker` 와 **byte-level 일치**하는가
7. worker 2명 이상인 ticket의 경우, 각 `plan.<worker>.md` 가 frontmatter `workflow[].plan` 에 명시된 파일명과 **1:1 매칭**되는가 (이름 typo 방지)
