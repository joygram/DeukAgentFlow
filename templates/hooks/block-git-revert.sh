#!/usr/bin/env bash
# PreToolUse(Bash) 훅: 파괴적/이탈성 git 명령을 차단한다.
#
# 차단 대상:
#   git checkout <무엇이든>   전환·원복·생성 전부
#   git switch <무엇이든>     전환·생성 전부
#   git restore <path>        --staged 전용은 워킹트리 안전 → 허용
#   git reset --hard
#   git reset <코밋>        HEAD~n/ORIG_HEAD/SHA — 커밋 되돌리기
#   git revert             되돌림 커밋 생성
#   git commit -m "revert/원복/되돌림/롤백 ..."  수작업 되돌림 커밋
#   git 전역 옵션(-c/--no-pager/--git-dir 들)을 사이에 끼운 우회도 동일 판정
#   git worktree add
#   인터프리터 우회: subprocess(['git','checkout']) 류 리스트 인자 — 정규화 후 동일 판정
#   서브프로세스 원천 차단: 프로세스 실행 키워드+인용 git, 인라인 인터프리터+git — 하위명령 불문
#   내용복원 우회: git show/cat-file 출력 + 파일 쓰기·삭제 콤보 — 원복으로 판정
#   git stash                 하위명령 불문 전면 차단(list/show 포함)
#     실측 사고: stash 한 번에 추적 파일 80개 삭제 + 무관 파일 17개 수정이
#     통째로 말려 들어갔다가 pop 으로 되쏟아져 작업 트리가 뒤집혔다.
#     stash 는 "내 변경만" 담지 않는다 — 추적된 변경 전부를 담는다.
#
# 통과: git status/diff/log/add/commit/push 등
# git branch 생성은 block-branch-create.sh 가 별도 판정한다.
#
# stdin 은 PreToolUse hook JSON 이지만 파싱하지 않는다 — 커맨드에 위 패턴이
# 있는지만 보면 되므로 원문을 그대로 검사한다(외부 파서 의존 없음).

payload="$(cat | tr -d '\r\n')"
[ -z "$payload" ] && exit 0

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

MSG_RESTORE="워킹트리 파일 원복은 미커밋 작업을 통째로 소실시킵니다 — 금지(사용자 허락 필요). git checkout <path>/./-- , git restore <path>, git reset --hard 는 차단됩니다. 되돌리려면 파일을 통째 checkout하지 말고 Edit로 그 줄만 원복하세요. 스테이징만 되돌리려면 git restore --staged (워킹트리 보존)."
MSG_STASH="git stash 는 금지입니다 — 저장소의 미커밋 변경을 통째로 말아 넣습니다(내 변경만이 아닙니다). 실측 사고: stash 한 번에 추적 파일 80개 삭제와 무관한 17개 수정이 함께 말려 들어갔다가 pop 으로 되쏟아져 작업 트리가 뒤집혔습니다. 변경 전후를 비교하려면 stash 하지 말고 (1) 지금 상태를 커밋해 복귀 지점을 만들거나, (2) git diff 로 읽거나, (3) Edit 로 그 줄만 되돌렸다 다시 넣으세요. list/show 를 포함해 stash 는 하위명령 불문 전면 차단입니다 — 읽기라서 안전하다는 판정을 스스로 내리는 것이 push 로 가는 습관의 입구입니다. 이전 커밋 트리를 통째로 재현해야 하면 git archive <sha> | tar -x -C <dir> 를 쓰세요."
MSG_BRANCH="브랜치 전환·생성은 금지입니다(전역 GIT BRANCH POLICY: 현재 브랜치에서만 작업). git checkout <branch> / git switch <branch> / -b / -c / worktree add 는 차단됩니다. 현재 브랜치 그대로 작업하세요."

# 리스트 인자(['git','checkout',...])·문자열 연결을 평문으로 펴서 같은 판정을 돌린다.
normalized="$(printf '%s' "$payload" | sed 's/\\n/ /g' | tr "[](){},'\"\\\\+;:=" ' ' | tr -s ' ')"

has() { printf '%s %s' "$payload" "$normalized" | grep -qE "$1"; }

# JSON 안에서 공백은 실제 공백이거나 \n 이스케이프로 나타난다.
SP='([[:space:]]|\\n)+'
GIT="(^|[^a-zA-Z0-9_./-])git${SP}((-C|-c|--git-dir|--work-tree|--namespace|--exec-path)(${SP}|=)[^[:space:]\"]+${SP}|--no-pager${SP}|--literal-pathspecs${SP})*"

# 서브프로세스/인라인 인터프리터로 감싼 git — 하위명령 불문 원천 차단
MSG_WRAP="git 을 서브프로세스·인라인 인터프리터로 감싸는 것은 하위명령 불문 차단됩니다 — 래퍼 안의 git 은 훅이 하위명령을 판정할 수 없는 우회 경로입니다. git 은 Bash 명령으로 직접 실행하세요. 워킹트리 원복·브랜치 전환은 래퍼로도 금지이며, 되돌리기는 사용자가 명시적으로 지시할 때만 허용됩니다."
EXEC_KW='(subprocess|child_process|os\.system|os\.popen|Popen\(|popen\(|execSync|spawnSync|execFileSync|spawn\(|execFile\(|proc_open|Start-Process|IPC::Run)'
INLINE_INTERP="(^|[^a-zA-Z0-9_./-])(python[0-9.]*|py|node|perl|ruby|php|deno|bun)(\\.exe)?${SP}[^|]{0,120}(-c|-e|--eval|<<)"
GIT_TOKEN='(^|[^a-zA-Z0-9_./-])git([^a-zA-Z0-9_-]|$)'
has "['\\\"\\\\]git['\\\"\\\\]" && has "$EXEC_KW" && deny "$MSG_WRAP"
if has "$INLINE_INTERP"; then
  has "$GIT_TOKEN" && deny "$MSG_WRAP"
  has '(pygit2|dulwich|porcelain|GitPython)' && deny "$MSG_WRAP"
fi

has "${GIT}reset${SP}[^\"]*--hard" && deny "$MSG_RESTORE"
has "${GIT}worktree${SP}add" && deny "$MSG_BRANCH"
has "${GIT}switch([[:space:]]|\\\\n|\")" && deny "$MSG_BRANCH"

MSG_REVERT="되돌림은 금지입니다 — git revert / git reset <코밋> / 되돌림 커밋 전부 차단됩니다. 에러는 설계가 틀렸다는 증거가 아니라 아직 안 고쳤다는 뜻입니다. 이전 방식으로 복귀하지 말고 설계 정본대로 그 자리를 Edit 로 전진 수정하세요. 세 번 시도해도 안 되면 되돌리지 말고 멈춰서 보고하세요. 되돌리기는 사용자가 명시적으로 지시할 때만 허용됩니다."
has "${GIT}revert" && deny "$MSG_REVERT"
has "${GIT}reset${SP}(--soft|--mixed|--keep|--merge)?${SP}?(HEAD[~^]|HEAD@|ORIG_HEAD|@[~^]|[0-9a-f]{7,40}([[:space:]]|\n|\"|$))" && deny "$MSG_REVERT"
DOC_TYPE="${GIT}commit.*(-m|--message)([[:space:]]|\n|=)+[\\\\\"]*(docs|test|style)(\([^)]*\))?:"
if has "${GIT}commit.*(-m|--message)([[:space:]]|\n|=)+[\\\\\"]*([a-z]+(\([^)]*\))?:[[:space:]]*)?(revert|Revert|REVERT|[Rr]oll ?back|원복|되돌림|되돌리|되돌렸|철회|롤백|\\u(cc98|c6d0)\\u(d68c|bcf5)|\\ub418\\ub3cc\\u(b9bc|b9ac|b838)|\\ub864\\ubc31)" && ! has "$DOC_TYPE"; then deny "$MSG_REVERT"; fi

# stash — 하위명령 불문 전면 차단
has "${GIT}stash" && deny "$MSG_STASH"

# restore — --staged 전용(인덱스만)이면 허용
if has "${GIT}restore"; then
  if has "${GIT}restore${SP}--staged" && ! has '[-][-]worktree'; then
    :
  else
    deny "$MSG_RESTORE"
  fi
fi

# show/cat-file + 파일 쓰기·삭제 콤보 — 과거 내용을 워킹트리에 덮어쓰는 원복 우회
MSG_CONTENT="과거 커밋 내용을 꺼내 워킹트리 파일에 덮어쓰거나 산출물을 지우는 것은 원복 우회입니다 — git show/cat-file 과 파일 쓰기·삭제(open().write, os.remove, shutil, 리다이렉트)를 한 명령에 섞는 것은 차단됩니다(파이썬·노드 래퍼 포함). 되돌리려면 Edit 로 그 줄만 수정하세요. 이전 커밋 트리 재현이 필요하면 git archive <sha> 를 별도 디렉터리에 푸세요. 되돌리기는 사용자가 명시적으로 지시할 때만 허용됩니다."
if has "${GIT}(show|cat-file)"; then
  has '(open\(|write_bytes|write_text|writeFileSync|writeFile\(|os\.remove|os\.unlink|shutil\.|\brm -|Remove-Item|Set-Content|Out-File)' && deny "$MSG_CONTENT"
  has "${GIT}(show|cat-file)[^|\"]*>" && deny "$MSG_CONTENT"
fi

# checkout — 전부 차단. 경로성 신호면 원복 메시지, 아니면 브랜치 메시지.
if has "${GIT}checkout"; then
  has "${GIT}checkout${SP}[^\"]*(--([[:space:]]|\\\\n)|\\.([[:space:]]|/|\\\\n|\")|[^[:space:]\"]*/|[^[:space:]\"]+\\.[a-zA-Z0-9]+)" \
    && deny "$MSG_RESTORE"
  deny "$MSG_BRANCH"
fi

exit 0
