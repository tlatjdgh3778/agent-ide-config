# Paseo

Paseo 구성입니다. Paseo 플러그인은 운영체제와 관계없이 같은 코드로 동작하므로 macOS/Windows로 나누지 않습니다.

| 폴더 | 내용 |
|---|---|
| [`machine-groups/`](machine-groups/) | 머신(호스트) → 그룹 → 작업 공간 사이드바 |

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

## machine-groups

Herdr Workspace의 그룹 사이드바를 옮긴 것입니다. 그룹은 머신마다 따로 만들고, 작업 공간은 직접 넣을 때만 그룹에 들어갑니다. 경로로 자동 분류하지 않습니다.

- 그룹 목록과 배정은 **플러그인을 설치한 데몬 한 곳**(홈)의 호스트 설정에 머신 ID별로 저장됩니다. Paseo 사이드바 뷰는 자기 설치본의 설정만 읽을 수 있어서, 다른 데몬마다 나눠 저장하지 않습니다. 그래서 플러그인은 홈 데몬 하나에만 설치합니다. 이 구성에서는 항상 켜져 있는 WSL 데몬이 홈입니다.
- 접기 상태는 기기마다 따로 저장됩니다.
- 워크트리는 같은 프로젝트의 원본 체크아웃 아래에 한 단계 들여 쓰고 브랜치 아이콘으로 표시합니다. 원본이 같은 그룹에 없으면 그룹 안 맨 위 단계에 둡니다.

```sh
git clone https://github.com/tlatjdgh3778/agent-ide-config.git
cd agent-ide-config/paseo/machine-groups && npm install
paseo plugin install "$PWD"
```

설치 후 앱의 **Settings → Sidebar → Sidebar view**에서 **Machine groups**를 고릅니다.

- 행이나 머리에 마우스를 올리면 나오는 `⋯`에서 그룹 이동, 새 그룹, 이름 변경, 삭제를 합니다.
- 그룹을 삭제하면 안에 있던 작업 공간은 그룹 밖(머신 바로 아래)으로 나옵니다.
- 보관한 작업 공간의 배정은 남아 있어서, 보관을 풀면 원래 그룹으로 돌아옵니다.

개발: `npm test`(그룹 로직 단위 테스트), `npm run typecheck`. 코드를 고친 뒤 `paseo plugin reload machine-groups`.
