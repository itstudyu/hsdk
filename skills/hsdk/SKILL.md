---
name: hsdk
description: "hsdk 메인 라우터. 인자 없이 호출되면 active 티켓 상태를 보고 다음 단계(/hsdk:plan 또는 /hsdk:run)를 안내. 인자가 있으면 /hsdk:plan으로 위임. 부트스트랩 안 되어 있으면 /hsdk:init 안내. 4-skill 흐름(plan → approve → run → status)을 자연어 한 줄로 정리해주는 entry point."
when_to_use: "사용자가 hsdk 사용을 시작하려 할 때, 또는 '어디서부터 시작하지?' 같은 모호한 요구일 때. 명시적으로 /hsdk:plan / /hsdk:run / /hsdk:status / /hsdk:init 을 안다면 그것들을 직접 쓰는 게 더 빠름."
allowed-tools: Read, Glob, Bash
model: sonnet
---

# /hsdk — Router / Entry Point

## 트리거

```
/hsdk                  # active 티켓 상태 + 다음 액션 안내
/hsdk <자연어 요구>     # /hsdk:plan 으로 위임 (인자를 그대로 전달)
```

## Step 0. 부트스트랩 가드

```bash
if [ ! -f .harness/refs.yaml ] || ! grep -q "^bootstrapped:[[:space:]]*true" .harness/refs.yaml; then
  echo "BOOTSTRAP_NEEDED=1"
else
  echo "BOOTSTRAP_NEEDED=0"
fi
```

`BOOTSTRAP_NEEDED=1` → 사용자 언어로:

> "이 프로젝트는 아직 hsdk 부트스트랩이 안 됐습니다. `/hsdk:init` 을 먼저 실행하세요."

후 종료. 다른 단계로 진행 X.

## Step 1. 인자 분기

### 1a. 인자 있음 → /hsdk:plan으로 위임

사용자에게 1줄 안내:

> "`/hsdk:plan` 으로 위임합니다. grilling 후 명시적 승인 게이트가 있습니다."

그리고 `/hsdk:plan <전달 인자>` 와 동일하게 동작하도록 안내한다. (skill에서 다른 skill 직접 호출은 불가하므로, 사용자에게 `/hsdk:plan <요구>` 를 다시 실행하도록 명시적으로 요청하거나, 이 skill 내부에서 그대로 plan.md 작업을 시작하지 않고 안내만 한다.)

> **운용 노트**: Claude Code skill끼리 직접 invoke 할 수 없으므로, 이 skill은 "라우터" 역할에 한정. 사용자에게 적절한 다음 명령을 알려주는 책임만 진다.

### 1b. 인자 없음 → status 요약 + 다음 액션 안내

`.harness/tickets/active/*` 를 Glob으로 스캔:

```bash
for d in .harness/tickets/active/*/; do
  id=$(basename "$d")
  [ "$id" = "*" ] && continue
  plan="$d/plan.md"
  [ -f "$plan" ] || continue
  status=$(awk '/^status:/{print $2; exit}' "$plan")
  approved=$(awk '/^approved_at:/{print $2; exit}' "$plan")
  echo "$id|$status|$approved"
done
```

## Step 2. 보고 (사용자 언어)

### 2a. active 0개

> "active 티켓이 없습니다. `/hsdk:plan \"<요구>\"` 로 새 작업을 시작하세요."

### 2b. active 1개

해당 티켓의 다음 액션 1개만 명확히:

- `status: draft` → "`/hsdk:plan` 을 다시 호출해 grilling을 마무리하세요"
- `status: ready` + `approved_at: null` → "`/hsdk:plan` 출력의 [a]pprove 게이트를 통과시키세요"
- `status: ready` + `approved_at: <ISO>` → "`/hsdk:run` 으로 실행하세요"
- `status: wip` → "이미 실행 중이거나 중단된 상태입니다. `/hsdk:status` 로 상세 확인"
- `status: blocked` → "plan.md를 검토 후 재계획이 필요합니다"

### 2c. active 2개 이상

`/hsdk:status` 와 동일한 표 출력 + 각 티켓의 다음 액션. 자세한 안내는 `/hsdk:status` 권장.

## 4-skill 흐름 요약 (참조)

```
/hsdk:init                   # 1회만 (프로젝트당)
/hsdk:plan "<요구>"           # grilling → plan.md (draft) → 명시 승인 → approved_at 기록
/hsdk:run [<id>]             # hard gate 통과 시 worker dispatch → results.md → done/
/hsdk:status                 # 진행 상황 확인
```

## 언어 정책

- 모든 사용자 출력: 사용자 언어
- 식별자 / 명령어: 영문 그대로

## Negative Space

- ❌ 파일 수정 — 이 skill은 read-only
- ❌ `Agent` 호출 — leaf
- ❌ 인자가 있을 때 자체적으로 planner를 호출 — 명시적으로 `/hsdk:plan` 으로 라우팅
- ❌ 사용자에게 4-skill 전부를 한 번에 나열 — 현재 상태에 맞는 다음 1개 액션만
