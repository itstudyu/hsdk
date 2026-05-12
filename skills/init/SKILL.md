---
name: init
description: "타깃 프로젝트에 hsdk 부트스트랩을 수행한다. .harness/ 디렉토리 구조, refs.yaml, 그리고 plugin이 ship하는 default workers(code-analyst + example-editor)를 .claude/agents/workers/ 에 복사. /hsdk:plan 실행 전 1회만 필요. 사용자 자연어 입력에서 참조 문서 경로(@path, ~/path, key=path 등)를 추출해 refs.yaml에 등록."
when_to_use: "사용자가 새 프로젝트에서 hsdk를 처음 사용할 때, 또는 refs.yaml/워커를 다시 정리하고 싶을 때"
allowed-tools: Read, Write, Edit, Glob, Bash, AskUserQuestion
model: opus
---

# /hsdk:init — 타깃 프로젝트 부트스트랩

## 트리거

```
/hsdk:init                                  # 최소 부트스트랩 (default workers만)
/hsdk:init <자연어 요구>                     # 참조 문서/매핑 등록 포함
```

예시:
- `/hsdk:init`
- `/hsdk:init "coding-rule=~/Downloads/coding-rule.md"`
- `/hsdk:init "@docs/design-system.md always 적용"`

## Step 0. 실행 컨텍스트 가드 (hsdk 레포에서는 거부)

```bash
if [ -f .claude-plugin/plugin.json ]; then
  name=$(python3 -c "import json; print(json.load(open('.claude-plugin/plugin.json')).get('name',''))" 2>/dev/null)
  [ "$name" = "hsdk" ] && echo "IS_HSDK_REPO=1" || echo "IS_HSDK_REPO=0"
else
  echo "IS_HSDK_REPO=0"
fi
```

`IS_HSDK_REPO=1`이면 **사용자 언어**로 거부:
> "여기는 hsdk plugin 레포 자체입니다. 타깃 프로젝트로 cd 후 다시 실행하세요."

## Step 1. 자연어 입력 파싱 (있을 때만)

다음 패턴을 인식:

- 참조 문서 경로: `@./docs/x.md`, `~/Downloads/y.md`, `key=path`, `path 적용`
- `~`는 `$HOME`으로 해석 (`eval echo "$path"` 또는 `realpath`)
- auto-load 모드 키워드: `always`, `conditional`, `manual`. 없으면 휴리스틱:
  - 파일명에 `coding-rule` / `convention` / `style` / `policy` → `always`
  - 도메인-한정 (`api-spec`, `ui-spec`) → `conditional`
  - 그 외 → `manual`

**참조 파일은 복사하지 않는다.** 절대경로만 refs.yaml에 등록.

## Step 2. AskUserQuestion (모호한 경우만)

명확하면 모두 스킵. 묻는 순서:

1. **auto-load 모드 모호 시** — 각 ref에 대해 `(A) always (Recommended)` / `(B) conditional` / `(C) manual`
2. **`docs/structure.md` 부재 시** — `(A) 첫 /hsdk:plan 호출 때 planner가 자동 발견 (Recommended)` / `(B) placeholder 지금 생성`

자연어 입력에 워커별 매핑(`backend → @docs/api.md`)이 있으면 per-worker 섹션에 자동 적용. 없으면 묻지 않음.

## Step 3. .claude/agents/workers/ 에 default workers 복사

```bash
mkdir -p .claude/agents/workers
```

Plugin이 ship하는 default workers를 복사. 단, **기존 파일이 있으면 덮어쓰지 않음** (Surgical Changes):

- 소스: `${CLAUDE_PLUGIN_ROOT}/agents/workers/code-analyst.md` → `.claude/agents/workers/code-analyst.md`
- 소스: `${CLAUDE_PLUGIN_ROOT}/agents/workers/example-editor.md` → `.claude/agents/workers/example-editor.md`

> `${CLAUDE_PLUGIN_ROOT}`는 Claude Code가 plugin skill 실행 시 자동으로 주입하는 변수. 미설정 시 안전 fallback으로 `~/.claude/plugins/cache/hsdk/hsdk/<latest>/agents/workers/` 를 Glob으로 탐색.

Bash 스크립트:

```bash
src="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/hsdk/hsdk/*/ 2>/dev/null | sort -V | tail -1)}/agents/workers"
for w in code-analyst example-editor; do
  if [ ! -f ".claude/agents/workers/$w.md" ]; then
    cp "$src/$w.md" ".claude/agents/workers/$w.md"
    echo "INSTALLED: $w"
  else
    echo "EXISTS: $w (skipped)"
  fi
done
```

## Step 4. .harness/refs.yaml 생성/갱신

`.harness/refs.yaml` 존재 시 merge 모드, 없으면 default 생성:

```yaml
version: 1
bootstrapped: true
defaults:
  - path: docs/structure.md
    role: project-structure
    auto-load: always
user-defined: []
per-worker: {}
```

Step 1에서 파싱한 참조 문서를 `user-defined:` 에 append:

```yaml
user-defined:
  - path: <절대경로 또는 프로젝트 상대경로>
    role: <name>
    auto-load: always | conditional | manual
    keywords: [<kw1>, <kw2>]   # conditional 시 필수
```

워커별 매핑이 입력에 있었으면 `per-worker:` 에 추가:

```yaml
per-worker:
  backend:
    - <path>
```

기존 파일 갱신 시 surgical Edit이 아니라 **전체 Write** (YAML 정합성 보장). 백업 권장: `cp refs.yaml refs.yaml.bak`.

## Step 5. .harness/ 디렉토리 scaffold

```bash
mkdir -p .harness/tickets/active .harness/tickets/done
touch .harness/tickets/active/.gitkeep .harness/tickets/done/.gitkeep
```

> hfx와 달리 hsdk는 `log.md`, `backlog.md`를 만들지 않는다 (Simplicity First, spec I 섹션).

## Step 6. 보고 (사용자 언어)

다음을 한 줄씩 보고:

1. 설치된 workers (`code-analyst`, `example-editor`)
2. 등록된 refs (path + auto-load 모드)
3. 다음 단계: `/hsdk:plan "<요구>"` 로 작업 시작

## Negative Space

- ❌ hsdk plugin 레포 자체에서 실행 (Step 0 가드)
- ❌ `Agent` 도구 사용 — 이 skill은 leaf, sub-agent dispatch 없음
- ❌ 기존 워커 파일 덮어쓰기
- ❌ 참조 파일을 프로젝트 안으로 복사 (경로만 등록)
- ❌ `docs/structure.md` 직접 생성 (planner가 첫 호출 때 발견하거나, 사용자가 placeholder 선택 시만 생성)
- ❌ `.harness/log.md` / `.harness/backlog.md` 생성 (Simplicity First)

## 언어 정책

- 사용자 대화: 사용자 언어 (자동 감지)
- refs.yaml 본문: 영문 식별자 + 자유 description
- 보고: 사용자 언어
