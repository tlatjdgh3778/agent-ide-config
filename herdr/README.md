# Herdr

Herdr App의 **Herdr Workspace** 레이아웃입니다. 두 운영체제에서 프로젝트와 워크트리를 머신별 그룹으로 묶고, Space 맵과 Agents 상태를 확인하며, 파일 검색·Git Changes·탭 잠금을 사용할 수 있습니다.

Agents는 **확인할 작업**에서 입력 대기와 안 읽은 항목을 프로젝트별로 보여줍니다. 방금 연 항목은 **보고 있음**으로 남고, **전체 보기**에서는 작업 중과 유휴 세션도 확인할 수 있습니다. Spaces의 워크트리 메뉴는 선택한 Space의 저장소를 사용합니다.

그룹은 이름뿐이고 경로 규칙이 없습니다. Space는 사이드바에서 끌어다 놓거나 우클릭해 그룹에 넣고, 그룹 자체는 Spaces 머리말의 **그룹 설정**에서 머신마다 추가·이름 변경·삭제합니다.

Herdr App을 한 번 실행해 기본 설정을 만든 뒤 이 저장소를 받습니다. 두 PC에 같은 구성을 맞출 때는 같은 Git 커밋을 사용합니다. Git 기능에는 해당 PC에서 Herdr가 실행할 수 있는 Git이 필요합니다.

```sh
git clone https://github.com/tlatjdgh3778/agent-ide-config.git
cd agent-ide-config/herdr
```

## macOS

`jq`가 설치된 Mac에서 실행합니다. `--group-folder`는 처음 한 번 그 폴더 아래 Space를 묶은 그룹 하나를 만들어 주는 편의 옵션이며, 생략하면 그룹 없이 시작해 앱에서 직접 만들면 됩니다.

```sh
./macos/install.sh --group-folder "$HOME/Work"
```

Herdr에서 **Herdr Workspace** 레이아웃을 선택합니다. Mac 버전 하단에는 Claude Code와 Codex의 Usage Limits 모드가 포함됩니다. 각 서비스에 로그인한 CLI가 반환하는 한도만 표시됩니다. [Mac 설치 레시피](macos/RECIPE.md)

## Windows

PowerShell에서 실행합니다. `-GroupFolder`도 마찬가지로 초기 그룹 하나를 만드는 용도이며, 여러 폴더는 쉼표로 구분합니다.

```powershell
.\windows\Install.ps1 -GroupFolder 'D:\Work','C:\Projects'
```

Herdr에서 **Herdr Workspace · Windows** 레이아웃을 선택합니다. Windows에서는 잠긴 탭에 `Ctrl+W`가 적용되고, Files 우클릭에서 **탐색기에서 열기**를 사용할 수 있습니다. 하단은 Herdr 기본 상태바입니다. [Windows 설치 레시피](windows/RECIPE.md)

## Herdr 에이전트로 설치

Herdr에서 에이전트에게 이 저장소의 주소와 해당 운영체제의 `RECIPE.md`, 그 PC의 그룹 폴더 경로를 알려주면 됩니다. 두 설치 스크립트는 기존 단축키를 병합하고 백업을 남깁니다. 이름이 같은 Mod에 다른 파일이 있으면 먼저 확인을 요청할 수 있습니다.

그룹 구성과 개별 앱 설정, 탭·세션 기록, 인증 정보는 각 PC에 있습니다. 저장소에는 배포용 레이아웃, Mod 소스와 추가 단축키만 들어 있습니다.

설치 스크립트는 샘플 설정으로 검증했습니다. Windows의 실제 Explorer 및 키 입력 검증 범위는 [Windows 안내](windows/README.md#확인-범위)에 정리했습니다.

## 라이선스

Herdr App에서 복제한 구성은 Apache-2.0입니다. 함께 배포하는 File Explorer, Git Changes, Usage Limits의 원본 라이선스와 고지는 각 운영체제 폴더의 `licenses/`를 참고하세요.
