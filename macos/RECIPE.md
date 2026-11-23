# Herdr Workspace · macOS

Herdr App의 레이아웃과 네이티브 JavaScript Mod 모음입니다. 왼쪽 Spaces에는 머신별 그룹과 프로젝트, 워크트리가 보입니다. 아래 Agents는 Space 안에서 상태를 나누고 읽음 표시를 관리합니다. 상단 Space 맵은 현재 프로젝트나 전체 프로젝트를 카드와 연결선으로 그리고, 오른쪽 Files와 Changes는 파일 검색 및 Git 변경을 담당합니다. 하단 Usage Limits에는 로그인된 Claude Code와 Codex CLI의 사용량과 다음 초기화까지의 시간이 표시됩니다.

## 설치

1. Mac에서 Herdr App을 한 번 연 뒤, 그 앱이 쓰는 설정 폴더의 `AGENTS.md`와 이 폴더의 파일을 읽습니다. 레이아웃은 Herdr App 0.1.16을 기준으로 합니다.
2. `./install.sh --group-folder "/absolute/path/to/work"`를 실행할 때 실제 경로를 넣습니다. 이 폴더는 **처음 한 번** 그 아래 Space를 묶은 그룹 하나를 만드는 데만 쓰이고, 이후 그룹 관리는 앱 안에서 합니다. 폴더가 여러 개면 옵션을 반복하고, 생략하면 그룹 없이 시작해 앱에서 직접 만들면 됩니다. 설치 스크립트는 `jq`를 사용합니다.
3. 직접 복사할 때는 `layouts/personal-company.json`과 `mods/`의 각 모드를 같은 위치에 둡니다. 기존과 이름이 같고 내용이 다른 Mod는 보존합니다. 위 초기 폴더 배열은 레이아웃의 `sidebar → sidebar-lists → spaces → content.props.companyFolders`에 넣습니다. `keys.json`의 두 섹션은 기존 키 파일에 병합합니다.
4. 설치한 Mod를 `herdr-app check <폴더>`로 보고, `herdr-app do layout.switch --name personal-company`로 엽니다.

## 조작

- Spaces의 **+** 또는 `⌘N`으로 새 Space가 들어갈 그룹을 고른 다음 폴더를 고릅니다. 기존 Space는 그룹 머리말이나 그 그룹의 다른 Space 위로 끌어다 놓거나 우클릭해 옮깁니다. 어느 그룹에도 안 넣은 Space는 머리말 없이 머신 바로 아래에 놓이고, 드래그하는 동안에만 **그룹에서 빼기** 영역이 나타납니다.
- Spaces 머리말의 폴더 아이콘은 **그룹 설정**을 엽니다. 머신마다 그룹을 추가·이름 변경·삭제하며, 그룹은 이름뿐이고 경로 규칙은 없습니다.
- 탭을 우클릭해 잠그면 자물쇠가 표시되며 닫기 버튼, 메뉴의 닫기, `⌘W`가 잠금을 확인합니다.
- Space 맵은 **전체 / 현재 Space**로 전환할 수 있습니다. 빈 곳을 드래그해 이동하고, +·− 또는 ⌘/Ctrl+스크롤로 배율을 조절하며, **화면 맞춤**으로 전체 영역을 봅니다.
- Agents의 우클릭 메뉴에서 읽음 상태를 바꿉니다. Files는 이름과 경로로 검색합니다.

Git 관련 패널은 각 Space의 Git 정보를 읽습니다. 파일·Git 쓰기는 사용자가 해당 작업을 실행하는 경우에 일어납니다. Usage Limits는 로컬 셸 도구와 로그인된 CLI를 실행합니다. 이 레이아웃은 Claude Code와 Codex의 한도 보기를 켜며, 각 서비스가 반환하는 값으로 표시합니다.
