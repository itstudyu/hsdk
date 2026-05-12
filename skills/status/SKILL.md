---
name: status
description: "/hsdk:status로 .harness/tickets/active/*의 현재 상태를 표시한다. 각 ticket의 id, title, status, approved_at, 다음 권장 액션(/hsdk:plan 또는 /hsdk:run)을 사용자 언어로 보고. read-only — 어떤 파일도 수정하지 않음."
when_to_use: "사용자가 진행 중인 hsdk 작업을 확인하고 싶을 때, 또는 어느 ticket이 승인 대기인지 알고 싶을 때"
allowed-tools: Read, Glob, Bash
model: sonnet
---

# /hsdk:status — Active Ticket Overview

## 트리거

```
/hsdk:status
```

## Step 0. 부트스트랩 확인

`plan` / `run` / `hsdk` skill과 **동일한 가드**를 적용 (일관성):

```bash
if [ ! -f .harness/refs.yaml ]; then
  echo "BOOTSTRAP_NEEDED=missing"
elif ! grep -q "^bootstrapped:[[:space:]]*true" .harness/refs.yaml; then
  echo "BOOTSTRAP_NEEDED=incomplete"
elif [ ! -d .harness/tickets/active ]; then
  echo "BOOTSTRAP_NEEDED=incomplete"
else
  echo "BOOTSTRAP_NEEDED=no"
fi
```

`BOOTSTRAP_NEEDED ≠ no`이면 사용자 언어로 "이 프로젝트는 아직 hsdk 부트스트랩이 안 됐습니다. `/hsdk:init`을 먼저 실행하세요." 후 종료.

## Step 1. active ticket 목록 수집

```bash
ls -1 .harness/tickets/active/ | grep -v '^\.' | while read id; do
  plan=".harness/tickets/active/$id/plan.md"
  [ -f "$plan" ] || continue
  title=$(awk -F': ' '/^title:/{print $2; exit}' "$plan")
  status=$(awk '/^status:/{print $2; exit}' "$plan")
  approved=$(awk '/^approved_at:/{print $2; exit}' "$plan")
  echo "$id|$title|$status|$approved"
done
```

## Step 2. 각 ticket별 다음 액션 결정

| status | approved_at | 다음 액션 |
|---|---|---|
| `draft` | `null` | `/hsdk:plan` 으로 grilling 계속 또는 재호출 |
| `ready` | `null` | `/hsdk:plan` 의 [a]pprove 게이트 통과 필요 |
| `ready` | `<ISO>` | `/hsdk:run <id>` 실행 가능 |
| `wip` | `<ISO>` | 현재 실행 중 (또는 중단된 상태) |
| `blocked` | `<ISO>` | plan.md 검토 후 재계획 필요 |
| `done` | `<ISO>` | (자동으로 done/ 이동되어야 함 — active에 남아있으면 비정상) |

## Step 3. 사용자 언어로 표시

예시 출력 (한국어):

```
hsdk 활성 티켓:

  2026-05-13-add-auth     [ready, 승인 대기]
    → /hsdk:plan 결과의 [a]pprove 게이트를 통과시키세요

  2026-05-12-fix-cors     [wip, 실행 중]
    → /hsdk:run 2026-05-12-fix-cors 가 이미 진행 중인지 확인

  2026-05-11-refactor     [blocked]
    → plan.md를 검토 후 재계획 필요

active 티켓 3개. done 티켓: 8개 (.harness/tickets/done/).
```

ticket이 0개면: "active 티켓 없음. `/hsdk:plan <요구>` 로 시작하세요."

## 언어 정책

- 모든 출력: 사용자 언어
- ticket id / status 값 / 파일 경로: 영문 유지

## Negative Space

- ❌ 어떤 파일도 수정하지 않음 (read-only)
- ❌ `Agent` 도구 사용 — leaf skill
- ❌ blocked 상태를 자동 복구 시도
- ❌ done 티켓을 자동 정리
