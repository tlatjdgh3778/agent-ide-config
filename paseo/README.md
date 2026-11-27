# Paseo

Paseo 구성입니다. Paseo 플러그인은 운영체제와 관계없이 같은 코드로 동작하므로 macOS/Windows로 나누지 않습니다.

| 폴더 | 내용 |
|---|---|
| [`project-groups/`](project-groups/) | 그룹 → 프로젝트 → 작업 공간 사이드바. [topar12/paseo-project-groups](https://github.com/topar12/paseo-project-groups) 1.5.0 사본에 워크트리 기능 추가 |
| [`worktree-dashboard/`](worktree-dashboard/) | 프로젝트별 워크트리 카드와 검정고양이 에이전트 상태 보드 |
| [`skills-panel/`](skills-panel/) | 오른쪽 Explorer에서 Codex 세션의 스킬 목록 검색 |

## 구성

Paseo 0.17 이상이 필요합니다. Windows 앱 하나에 데몬 두 개를 붙여 씁니다.

| 호스트 | 데몬 | 주소 |
|---|---|---|
| Windows | 앱에 포함된 데몬 | `127.0.0.1:6767` |
| WSL | npm CLI로 설치한 독립 데몬, systemd로 자동 시작 | `127.0.0.1:6768` |

WSL 데몬은 Windows 데몬과 포트가 겹치지 않도록 6768을 씁니다. WSL의 localhost 포워딩으로 Windows에서 `127.0.0.1:6768`으로 접속합니다.

### WSL 데몬

```sh
npm install -g @getpaseo/cli
paseo daemon stop                                   # 이미 떠 있다면
paseo daemon config set daemon.listen 127.0.0.1:6768
paseo daemon config set pluginsEnabled true
sudo cp paseo-daemon.service /etc/systemd/system/   # 경로는 이 폴더의 예시 파일 기준
sudo systemctl daemon-reload
sudo systemctl enable --now paseo-daemon
```

[`paseo-daemon.service`](paseo-daemon.service)의 `ExecStart`와 `PATH`는 그 PC의 Node 설치 경로에 맞춥니다(`which paseo`).

Windows 앱의 **Settings → Hosts**에서 `127.0.0.1:6768`을 추가합니다.

## worktree-dashboard

Paseo 0.17.4 이상에서 사이드바 또는 Command Center의 **워크트리 보드**를 엽니다. 보드는 현재 선택한 호스트의 작업 공간을 읽습니다. **워크트리만**을 누르면 원본 체크아웃과 일반 폴더를 접고 Git 워크트리만 봅니다.

```sh
cd worktree-dashboard
npm ci
npm run typecheck
paseo plugin install "$PWD"
```

코드를 수정한 뒤에는 `paseo plugin reload worktree-dashboard`를 실행합니다.
