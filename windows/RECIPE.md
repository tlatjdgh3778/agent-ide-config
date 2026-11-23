# Herdr Workspace · Windows

Windows의 Herdr App에 프로젝트를 그룹별로 보는 화면을 추가한다. 왼쪽에서 저장소와 에이전트를 확인하고, 가운데에서 터미널이나 Space 맵을 열고, 오른쪽에서 파일과 Git 변경 사항을 살펴본다.

## 보이는 화면

- 왼쪽 위 **Spaces**는 지정 그룹과 기본 그룹을 접을 수 있게 표시한다. 각 프로젝트 아래에는 같은 Git 저장소의 워크트리 Space가 붙는다.
- 왼쪽 아래 **Agents**는 Space 안에서 입력 대기, 작업 중, 완료, 유휴를 나누고 안 읽은 에이전트에 점을 표시한다.
- 탭 바에는 **Space 맵**, **Files**, **Changes** 버튼이 있다. Space 맵은 별도 탭에서 카드와 연결선을 그린다. Files는 경로 검색창과 폴더 트리를, Changes는 변경 파일 목록과 커밋 이력을 표시한다.

## 동작

- Spaces 옆 **+** 또는 `Ctrl+N`으로 그룹을 선택한 다음 폴더를 고른다. 기존 Space는 우클릭으로 분류를 바꾼다. 프로젝트의 분류를 바꾸면 워크트리도 함께 이동한다.
- 탭 우클릭으로 잠금을 바꾼다. 잠긴 탭에는 자물쇠를 표시하고 닫기 버튼, 우클릭 닫기, 이 레이아웃의 `Ctrl+W`를 차단한다.
- Space 맵은 전체와 현재 Space 보기를 제공한다. 빈 곳을 드래그해 이동하고, +·− 또는 Ctrl+스크롤로 배율을 바꾸고, **화면 맞춤**으로 돌아온다. 에이전트 행을 누르면 해당 터미널로 이동한다.
- Agents에서 우클릭으로 읽음 상태를 바꾼다. 안 읽은 행을 열면 읽음으로 표시하며 에이전트의 실행 상태는 그대로 표시한다.
- Files에서 이름이나 경로를 검색하고 결과를 클릭하면 파일 탭이 열린다. 로컬 파일 또는 폴더의 **탐색기에서 열기**는 파일을 상위 폴더에서 선택하거나 폴더를 연다.

## 설치하는 에이전트용

1. Windows에서 Herdr App을 한 번 열어 기본 설정을 만든다. 설치 전에 대상 머신의 Herdr App 홈과 그 안의 `AGENTS.md`를 확인한다. 이 폴더의 레이아웃, Mod 소스, 키 설정과 설치 스크립트를 읽는다.
2. 그룹에 넣을 폴더의 **Windows 절대 경로**를 사용한다. 사용자가 경로를 아직 주지 않았다면 확인한다. 예시 경로를 설정에 쓰지 않는다.
3. `layouts/personal-company-windows.json`과 `mods/pc-win-*`을 대상 Herdr 홈의 같은 위치로 복사한다. 레이아웃의 `sidebar → sidebar-lists → spaces → content.props.companyFolders`에 그룹 폴더 배열을 넣는다. 드라이브 문자 경로와 UNC 경로를 지원한다.
4. 이 폴더의 `keys.json`은 추가 바인딩 조각이다. 대상 `keys.json`에 섹션별로 병합한다. 전체 파일을 덮어쓰지 않는다. 기존 사용자 단축키와 이름이 충돌하면 보존하고, `terminal` 범위의 `Ctrl+W`를 별도 확인한다. 해당 범위는 레이아웃 키보다 우선한다.
5. 위 복사와 병합을 한 번에 처리하려면 검토한 `Install.ps1`을 확인한 그룹 경로와 함께 실행해도 된다. 이 스크립트는 파일을 내려받거나 Herdr를 전환하지 않으며, 설정을 쓰기 전에 원래 키 파일의 복사본을 남긴다.
6. 설치한 모든 `pc-win-*` Mod에 `herdr-app check <폴더>`를 실행한다. 통과하면 `herdr-app do layout.switch --name personal-company-windows`로 연다. 기존 레이아웃, 테마, Space, 세션은 설치 대상으로 삼지 않는다.

## 구성

레이아웃은 `pc-win-spaces`와 `pc-win-agents`를 왼쪽에, `pc-win-tabs`를 위에, `pc-win-files`와 `pc-win-git-changes`를 오른쪽에 연결한다. `pc-win-menu`와 `pc-win-file-menu`는 팝업으로, `pc-win-space-map`과 `pc-win-file-viewer`는 필요할 때 탭으로 열린다. 하단은 Herdr의 `workspace-status`를 사용한다.

Space 맵과 Agents는 Herdr의 현재 Space와 터미널 데이터를 사용한다. 저장소와 워크트리, 파일 상태를 찾을 때 Git을 실행한다. 로컬 파일 목록과 Explorer 호출에는 PowerShell을 쓴다. 파일 편집이나 Git 변경은 사용자가 해당 기능을 선택할 때 실행된다.

## 확인할 점

- Herdr App 0.1.16을 기준으로 한 구성이다. Windows의 실제 키 입력과 Explorer UI는 확인이 필요하다. Git Changes 제작자는 macOS 검증 결과를 문서화했다.
- Windows에서 확인할 때는 임시 탭을 잠그고 `Ctrl+W`가 닫지 않는지, 해제 후 닫히는지 확인한다. 공백이 있는 로컬 폴더를 Files에서 우클릭해 Explorer가 여는지 확인한다.
- 경로에 따른 그룹 분류와 기존 화면으로 전환할 수 있는지 확인한다. 사용자 절대 경로, 인증 정보, 세션 상태나 로그는 설치 패키지에 포함하지 않는다.
