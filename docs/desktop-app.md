# 데스크톱 앱 (Electron)

비전공자 Windows 사용자가 Node.js를 설치하지 않고 내려받아 실행하는 설치형 셸입니다. 기존 React 화면과 `createAppServer` 조회 서버를 그대로 사용하고, Electron이 그 서버를 대신 실행합니다.

## 사용자 흐름

1. 설치 파일 또는 포터블 EXE를 실행합니다. Node.js 설치는 필요하지 않습니다.
2. 앱이 `127.0.0.1:4178`에만 열리는 로컬 서버를 먼저 시작하고, 그 주소를 창에 불러옵니다. 같은 포트가 이미 사용 중이면 저장 위치가 바뀌지 않도록 임시 포트로 이동하지 않고 종료 방법을 안내합니다.
3. 첫 실행 안내에서 고용24·사람인 중 하나를 골라 발급받은 키를 붙여넣습니다.
4. 키는 이 PC의 OS 보안 저장소로 암호화되어 `userData` 폴더에 저장되고, 화면에서는 즉시 지워집니다.

브라우저 저장소(IndexedDB)에 보관되는 서류·메모·지원 기록은 기존과 동일하게 그대로 유지됩니다. `localhost:4178` 브라우저 실행 모드와 데스크톱 앱은 같은 화면과 API를 사용합니다.

## 보안 경계

- `contextIsolation: true`, `nodeIntegration: false`, `nodeIntegrationInWorker: false`, `webviewTag: false`.
- 창은 시작할 때 받은 루프백 주소만 불러옵니다. 다른 주소로 이동하려 하면 창 안에서 열지 않고 기본 브라우저로 넘깁니다.
- 새 창은 만들지 않습니다(`setWindowOpenHandler`가 모두 거부). 외부 링크는 `https:`만 허용합니다.
- `window.jarizipDesktop`에는 다음 다섯 개만 노출합니다.
  - `getPlatform()` → `{ platform, version }`
  - `getApiKeyStatus()` → `{ providers: [{ provider, configured }], encryptionAvailable }` (키 원문 없음)
  - `setApiKey(provider, key)`
  - `clearApiKey(provider)`
  - `openExternal(url)` → `https:`만
- `provider`는 `work24`·`saramin` 두 개만 허용합니다. 원티드·점핏·직행은 공식 API 승인이 없어 저장 자체를 거부합니다.
- 키 값은 로그·URL·오류 메시지·브라우저 저장소·백업에 남기지 않습니다. 복호화된 값은 main 프로세스 안에서만 존재하고, 기존에 만들어진 job 서비스가 바로 읽도록 `process.env`(`WORK24_AUTH_KEY`/`SARAMIN_ACCESS_KEY`)에만 반영합니다. 앱을 재시작할 필요가 없습니다.
- 입력 검증: provider 화이트리스트, 키 trim·빈값 거부·최대 512자·제어문자 거부. 외부 URL은 `https:` 절대 주소만 허용합니다.

## 저장 위치

- 키 저장 파일: `app.getPath('userData')/api-keys.json`. `safeStorage.encryptString`으로 암호화한 값만 담고, 가능한 플랫폼에서는 파일 권한을 `0600`으로 둡니다.
- OS 암호화를 쓸 수 없는 환경(`safeStorage.isEncryptionAvailable() === false`)에서는 **평문으로 대신 저장하지 않고** 저장을 거부하며 사용자에게 알립니다.
- 복호화할 수 없는 파일(다른 OS 사용자, 키체인 초기화, 형식 변경)은 "미설정"으로 처리하고 다시 입력하도록 안내합니다.

## 개발·검증 명령

```bash
npm run desktop            # 빌드 후 데스크톱 앱 실행
npm run desktop:smoke      # 창을 열어 preload 계약·키 왕복·첫 실행 안내를 검사
node --test desktop/*.test.mjs   # 자격 증명 저장소·IPC/preload 계약·로컬 서버 단위 검사
```

Linux에서 화면 서버가 없으면 `desktop:smoke`가 `xvfb-run`을 자동으로 사용합니다.

## 패키징

```bash
npm run package:linux            # release/ 에 linux-unpacked(dir)와 AppImage 생성
npm run package:win              # release/ 에 Windows portable EXE 생성 (권장)
npm run package:win:installer    # NSIS 설치 파일 생성 (Windows 또는 Wine 필요)
```

- Windows 기본 대상: `portable` EXE(설치 없이 실행). 아이콘은 `desktop/build/icon.ico`.
- NSIS 설치형 EXE는 선택 대상이며 Windows 또는 Wine이 있는 빌드 환경에서 생성합니다. 기본 공개 배포는 포터블 EXE 하나로 단순화합니다.
  - Windows에서 빌드하면 둘 다 생성됩니다. Linux/WSL에서 빌드할 때는 `nsis` 설치 파일 조립에 `wine`이 필요하며, 없으면 포터블 EXE만 만들고 설치 파일 단계에서 멈춥니다. 그래서 `npm run package:win` 대신 `npx electron-builder --win portable`로 포터블만 만들 수도 있습니다.
- Linux 대상: `dir`(로컬 검증용)와 `AppImage`. 아이콘은 `desktop/build/icon.png`.
- `node_modules`는 asar에 넣지 않습니다. 렌더러는 `dist/`에 미리 빌드되어 있고, 셸과 서버는 Node 내장 모듈만 사용하므로 패키지가 작고 실행 시 추가 설치가 필요 없습니다.
- 아이콘을 다시 만들려면 `npm run desktop:icons` (Playwright의 Chromium으로 SVG를 렌더링하고 ICO를 조립합니다).

서명·공증·자동 업데이트·릴리스 업로드는 이 저장소에서 수행하지 않습니다. Windows SmartScreen 경고는 코드 서명 인증서를 적용해야 사라집니다.
