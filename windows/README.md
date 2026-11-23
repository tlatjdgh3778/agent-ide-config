# Herdr Workspace · Windows

Herdr App용 레이아웃과 Mod 묶음입니다. 그룹별 Spaces, 워크트리, Space 맵, Agents 읽음 표시, 탭 잠금, Files 검색과 Git Changes를 포함합니다.

## Herdr 에이전트로 설치

Windows에서 ZIP을 푼 뒤 Herdr 안에서 Codex나 Claude Code를 열고 아래 문구를 붙여넣습니다. 두 경로는 실제 압축 해제 위치와 그룹 폴더로 바꿉니다.

> 내 Herdr App의 AGENTS.md와 `C:\Users\me\Downloads\herdr-config\windows\RECIPE.md`를 읽고 이 레이아웃을 추가해줘. 그룹 폴더는 `D:\Work`야. 기존 레이아웃과 세션은 유지한 채, 설치한 Mod를 검사하고 Herdr Workspace · Windows를 열어줘.

[설치 레시피](RECIPE.md)에 복사할 파일, 단축키 병합, Windows 경로와 앱 내 확인 방법이 있습니다.

## PowerShell로 직접 설치

1. Windows x64에서 Herdr App 0.1.16 이상을 한 번 열어 기본 설정을 만듭니다. 프로젝트·워크트리와 Git Changes 기능에는 Git for Windows가 필요합니다.
2. ZIP을 풀고 그 폴더에서 PowerShell을 엽니다. 아래 경로를 Windows에 있는 실제 그룹 폴더로 바꿉니다.

   ```powershell
   .\Install.ps1 -GroupFolder 'C:\Work','D:\Projects'
   ```

3. Herdr의 레이아웃 메뉴에서 **Herdr Workspace · Windows**를 선택합니다. 명령으로 전환하려면 다음을 실행합니다.

   ```powershell
   herdr-app do layout.switch --name personal-company-windows
   ```

설치 프로그램은 필요한 단축키만 Windows의 기존 키 설정에 합칩니다. 기본 구성 위치는 `%USERPROFILE%\.config\herdr-app`이며, `HERDR_APP_HOME`, `XDG_CONFIG_HOME` 또는 `-ConfigRoot`로 다른 위치를 지정할 수 있습니다. 기존 키 파일과 같은 이름의 레이아웃이 있으면 `backups` 아래에 복사본을 남깁니다. 폴더를 바꾸려면 새 경로로 설치 명령을 다시 실행합니다.

## 사용

- 그룹은 머신에 속합니다. Spaces 머리말의 폴더 아이콘으로 **그룹 설정**을 열어 머신별로 그룹을 추가·이름 변경·삭제합니다. Space를 그룹에 넣으려면 사이드바에서 그룹 머리말이나 그 그룹의 다른 Space 위로 끌어다 놓거나, 우클릭해 **○○으로 이동**을 선택합니다. 어느 그룹에도 넣지 않은 Space는 머리말 없이 머신 바로 아래에 표시되며, 드래그하는 동안에만 **그룹에서 빼기** 영역이 나타납니다. Git worktree는 같은 저장소에 속하면 프로젝트 아래에 붙고, 프로젝트를 옮기면 함께 따라갑니다.
- 터미널이나 다른 도구가 만들어 둔 워크트리도, 아직 Space가 없으면 프로젝트 아래에 **흐린 행**으로 보입니다. 눌러서 Space로 열면 보통 행이 됩니다. 어디에 만들었는지는 상관없습니다 — `git worktree list`에 잡히면 보입니다.
- 탭 우클릭 메뉴에서 **잠금 / 잠금 해제**를 선택합니다. 잠긴 탭의 닫기 버튼과 우클릭의 닫기는 비활성화되며, 이 레이아웃의 `Ctrl+W`도 잠금을 검사합니다. 이 키는 이 레이아웃에서 터미널 프로그램에 전달되는 대신 탭 닫기에 사용됩니다.
- Files에서 로컬 파일이나 폴더를 우클릭해 **탐색기에서 열기**를 선택합니다. 폴더는 탐색기에서 열리고, 파일은 상위 폴더에서 선택됩니다. 파일의 **Open with default app**은 Windows에 연결된 기본 앱으로 엽니다.
- Mac에서 사용하던 Spaces와 터미널, 읽음 상태, 탭 잠금 기록은 각 머신의 상태입니다. 이 패키지에는 그런 기록과 인증 정보가 포함되지 않습니다. Windows에서 새로 만든 세션이나 Herdr에서 연결한 머신의 세션을 표시합니다.
- Windows 레이아웃의 하단에는 Herdr 기본 상태바가 표시됩니다. 기존 Usage Limits 모드는 macOS/Linux 셸 도구를 사용합니다.

## 확인 범위

Mac의 PowerShell에서 설정 합치기, 경로 입력, 재설치와 충돌 처리 등을 확인했습니다. 포함된 Mod는 Mac의 Herdr 검사에서 통과했습니다. Windows에서 실제 Explorer 구동과 키 입력은 별도 확인이 필요합니다. Git Changes의 제작자도 Windows에서 테스트하지 않았다고 명시합니다.

## 출처

Herdr App 기본 모드를 바탕으로 만든 사용자 구성입니다. File Explorer와 Git Changes 코드는 아래 프로젝트에서 가져왔습니다. 원본 라이선스와 고지는 `licenses`에 있습니다.

- [Herdr App](https://github.com/herdrdev/herdr-app)
- [File Explorer](https://github.com/mchlkim/herdr-file-explorer)
- [Git Changes](https://github.com/aBER0724/herdr-git-changes)
