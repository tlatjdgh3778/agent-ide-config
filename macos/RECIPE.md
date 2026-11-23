# 개인 / 회사 · macOS

Herdr App의 레이아웃과 네이티브 JavaScript Mod 모음입니다. 왼쪽 Spaces에는 개인과 회사, 프로젝트, 워크트리가 보입니다. 아래 Agents는 Space 안에서 상태를 나누고 읽음 표시를 관리합니다. 상단 Space 맵은 현재 프로젝트나 전체 프로젝트를 카드와 연결선으로 그리고, 오른쪽 Files와 Changes는 파일 검색 및 Git 변경을 담당합니다. 하단 Usage Limits에는 로그인된 Claude Code와 Codex CLI의 사용량과 다음 초기화까지의 시간이 표시됩니다.

## 설치

1. Mac에서 Herdr App을 한 번 연 뒤, 그 앱이 쓰는 설정 폴더의 `AGENTS.md`와 이 폴더의 파일을 읽습니다. 레이아웃은 Herdr App 0.1.16을 기준으로 합니다.
2. `./install.sh --company-folder "/absolute/path/to/work"`를 실행할 때 실제 회사 경로를 넣습니다. 폴더가 여러 개면 옵션을 반복합니다. 경로를 생략하면 같은 레이아웃의 기존 분류 경로를 유지하며, 새 설치에서는 Space 우클릭으로 수동 분류할 수 있습니다. 설치 스크립트는 `jq`를 사용합니다.
3. 직접 복사할 때는 `layouts/personal-company.json`과 `mods/`의 각 모드를 같은 위치에 둡니다. 기존과 이름이 같고 내용이 다른 Mod는 보존합니다. 회사 경로 배열은 레이아웃의 `sidebar → sidebar-lists → spaces → content.props.companyFolders`에 넣습니다. `keys.json`의 두 섹션은 기존 키 파일에 병합합니다.
4. 설치한 Mod를 `herdr-app check <폴더>`로 보고, `herdr-app do layout.switch --name personal-company`로 엽니다.

## 조작

- Spaces의 **+** 또는 `⌘N`으로 분류한 다음 폴더를 고릅니다. 기존 Space는 우클릭해 분류를 바꿉니다.
- 탭을 우클릭해 잠그면 자물쇠가 표시되며 닫기 버튼, 메뉴의 닫기, `⌘W`가 잠금을 확인합니다.
- Space 맵은 **전체 / 현재 Space**로 전환할 수 있습니다. 빈 곳을 드래그해 이동하고, +·− 또는 ⌘/Ctrl+스크롤로 배율을 조절하며, **화면 맞춤**으로 전체 영역을 봅니다.
- Agents의 우클릭 메뉴에서 읽음 상태를 바꿉니다. Files는 이름과 경로로 검색합니다.

Git 관련 패널은 각 Space의 Git 정보를 읽습니다. 파일·Git 쓰기는 사용자가 해당 작업을 실행하는 경우에 일어납니다. Usage Limits는 로컬 셸 도구와 로그인된 CLI를 실행합니다. 이 레이아웃은 Claude Code와 Codex의 한도 보기를 켜며, 각 서비스가 반환하는 값으로 표시합니다.
