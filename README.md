# 영어 서재 (1단계)

내 논문·전문서적 PDF로 영어를 공부하는 개인용 앱입니다. PC와 갤럭시에 설치해서 쓰고, 자료와 학습 기록은 **구글 드라이브**에 저장됩니다.

## 1단계에 들어 있는 기능

| 화면 | 기능 |
|---|---|
| 처음 설정 | AI 연결(Gemini) 키 입력·확인 → 구글 계정 연결 → 앱 설치 안내 |
| 내 자료(홈) | 오늘 복습 수, 이어서 읽기, 자료 목록, 동기화 상태 안내 |
| 자료 올리기 | 이 기기 또는 **구글 드라이브에서 PDF 고르기** → 글자 추출(기기 안) → 드라이브 ‘영어서재’ 폴더에 원본 저장 |
| PDF 리더 | 쪽 넘기기, **단어를 누르면 뜻**(의학용어·한글 발음·어원), **단어 바로 아래 한글 발음**, **문장 번역**, 문장 듣기(0.75~1.25배) |
| Aa 보기 메뉴 | 한글 발음 · 번역 · 읽는 문장에만 · 글자 크기 (모든 화면 공통, PC·휴대폰 동기화) |
| 단어장 | 학습 중/알아요/전체, 출처(자료)별 보기, 검색 |
| 단어 상세 | 발음·뜻·어원, 상태 바꾸기, 이 단어가 나온 내 자료 문장 |
| 복습 | 간격 반복(FSRS, Anki 방식) — 다시·어려움·알맞음·쉬움 |
| 설정 | 보기, 구글 드라이브 동기화, AI 제공자·키 바꾸기, 백업 내려받기 |

문법·발음 평가·AI 대화는 2단계, 영상 자막·스캔본 글자 인식(PC 도우미)은 3단계에서 추가합니다. 하단 메뉴에는 미리 자리를 만들어 두었습니다.

---

## 1. 준비물 (PC에 한 번만 설치)

1. **Node.js 22 LTS** — https://nodejs.org 에서 LTS 버전 설치
2. **Git** — https://git-scm.com (GitHub에 올릴 때 필요)
3. **VS Code** — 코드 편집기 (이미 쓰고 계시면 그대로)

설치 확인: 명령 프롬프트(또는 VS Code 터미널)에서

```bash
node -v    # v22.x.x 처럼 나오면 OK
npm -v
```

## 2. PC에서 실행하기

1. 압축을 풀어 원하는 곳에 둡니다. 예: `D:\english-library`
2. 폴더 안의 `.env.local.example` 파일을 복사해서 이름을 **`.env.local`** 로 바꿉니다.
3. `.env.local`을 메모장(또는 VS Code)으로 열고, 구글 클라우드에서 받은 세 값을 넣습니다.

   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=여기에 클라이언트 ID
   NEXT_PUBLIC_GOOGLE_API_KEY=여기에 API 키
   NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER=여기에 프로젝트 번호
   ```

4. VS Code에서 폴더를 열고 터미널(Ctrl + `)에서:

   ```bash
   npm install
   npm run dev
   ```

5. 크롬에서 **http://localhost:3000** 을 엽니다. "처음 오셨네요 → 시작하기"를 따라 AI 키와 구글 연결을 마치면 됩니다.

> `.env.local`을 고친 뒤에는 터미널에서 Ctrl+C로 멈추고 `npm run dev`를 다시 실행해야 반영됩니다.

**PC에 앱으로 설치:** 크롬·엣지 주소창 오른쪽의 설치 아이콘(모니터 모양)을 누르면 바탕화면 아이콘이 생깁니다. 개발 모드(`npm run dev`)에서는 오프라인 기능이 꺼져 있고, 배포한 주소(아래 3번)에서 설치하면 오프라인 읽기까지 됩니다.

## 3. 갤럭시에서 쓰기 (GitHub Pages로 배포)

휴대폰은 PC의 `localhost`에 접속할 수 없고, 앱 설치에는 `https` 주소가 필요합니다. 그래서 코드를 GitHub에 올리면 **자동으로 `https://깃허브아이디.github.io/english-library/` 주소에 배포**되도록 설정해 두었습니다(`.github/workflows/deploy.yml`).

### 3-1. GitHub에 올리기

1. GitHub에서 새 저장소 만들기 — 이름: **`english-library`**
   - 무료 계정은 **공개(Public) 저장소**에서만 GitHub Pages를 쓸 수 있습니다(GitHub Pro는 비공개도 가능).
   - 공개해도 괜찮은 이유: `.env.local`은 올라가지 않고, AI 키(Gemini)는 코드에 없으며 각 기기에만 저장됩니다. 구글 클라이언트 ID와 (주소 제한을 건) API 키는 원래 웹 화면에 공개되는 값입니다.
2. 폴더에서:

   ```bash
   git init
   git add .
   git commit -m "영어 서재 1단계"
   git branch -M main
   git remote add origin https://github.com/깃허브아이디/english-library.git
   git push -u origin main
   ```

### 3-2. 저장소 설정 (한 번만)

1. 저장소 **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable** 로 세 개 등록
   - `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_PROJECT_NUMBER` (값은 `.env.local`과 같음)
2. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 선택
3. **Actions** 탭에서 "Deploy to GitHub Pages"가 초록색 ✓ 가 되면 배포 완료 (처음이면 오른쪽 위 "Run workflow"로 한 번 실행)

### 3-3. 구글 클라우드에 새 주소 등록 (한 번만)

1. **Google 인증 플랫폼 → 클라이언트 → (만든 클라이언트)** → 승인된 자바스크립트 원본에 추가:
   `https://깃허브아이디.github.io` (뒤에 `/english-library`나 `/`를 붙이지 않음)
2. **API 및 서비스 → 사용자 인증 정보 → (만든 API 키)** → 웹사이트 제한에 추가:
   `https://깃허브아이디.github.io/*`

### 3-4. 갤럭시에 설치

1. 갤럭시 크롬에서 `https://깃허브아이디.github.io/english-library/` 열기
2. 오른쪽 위 ⋮ → **앱 설치**(또는 홈 화면에 추가) — 삼성 인터넷은 메뉴 → 현재 페이지 추가 → 홈 화면
3. 홈 화면의 "영어 서재" 아이콘으로 열고, 처음 설정에서 AI 키(Gemini)를 입력하고 같은 구글 계정으로 연결

이제 PC에서 저장한 단어·읽던 쪽·보기 설정이 휴대폰에도 그대로 나타납니다.

**코드를 고친 뒤에는** `git add . && git commit -m "내용" && git push` 만 하면 몇 분 뒤 휴대폰 앱에도 자동 반영됩니다.

---

## 데이터는 어디에 저장되나요?

| 저장할 것 | 위치 |
|---|---|
| PDF 원본 | 내 드라이브 › **영어서재** 폴더 (드라이브에서 보임) |
| 추출한 본문, 번역·한글 발음 캐시, 단어장, 읽던 쪽, 보기 설정 | 드라이브의 **앱 전용 숨김 폴더** (드라이브 목록엔 안 보임) |
| 같은 내용의 사본 | 각 기기 안(IndexedDB) — 인터넷이 없어도 읽기·복습 가능 |
| AI 키 (Gemini) | **각 기기에만** 저장 (드라이브·코드에 올라가지 않음) |

앱은 `drive.file`(이 앱이 만들거나 내가 고른 파일만), `drive.appdata`(앱 전용 숨김 폴더) 두 권한만 씁니다. 드라이브의 다른 파일은 열 수 없습니다.

## AI 사용 비용 줄이는 구조

- 단어 뜻·번역·한글 발음은 **읽을 때 보이는 문장만** 묻고, 결과를 저장해서 **같은 문장은 다시 묻지 않습니다**.
- Aa 메뉴의 **"읽는 문장에만"** 을 켜면 지금 읽는 문장(과 다음 문장)만 분석해서 사용량이 크게 줄어듭니다.
- 기본 모델은 `gemini-3.5-flash-lite`입니다. `.env.local`의 `NEXT_PUBLIC_GEMINI_MODEL`로 바꿀 수 있습니다.

## 폴더 구조

```
english-library/
├─ .github/workflows/deploy.yml   GitHub Pages 자동 배포
├─ public/                        앱 아이콘, manifest(설치 정보), sw.js(오프라인)
├─ scripts/copy-pdf-worker.mjs    npm install 때 PDF 처리 파일 복사
└─ src/
   ├─ app/                        화면(주소별 폴더)
   │  ├─ page.tsx                 내 자료(홈)
   │  ├─ setup/  upload/  reader/  vocab/  word/  review/  settings/
   │  └─ grammar/  pronounce/  chat/   (2단계 자리)
   ├─ components/                 Aa 메뉴, 단어 뜻 창, 하단 메뉴 등 공통 부품
   └─ lib/
      ├─ google.ts   구글 로그인(토큰)
      ├─ drive.ts    드라이브 파일 올리기·읽기·고르기
      ├─ store.tsx   기기 저장 + 드라이브 동기화 (PC·휴대폰 병합)
      ├─ pdf.ts      PDF 글자 추출·머리말 제거·문장 나누기
      ├─ claude.ts   단어 사전·번역·한글 발음 (analysis 로직)
      ├─ ai.ts       AI 호출 공통(Gemini)
      ├─ srs.ts      간격 반복 복습(FSRS)
      └─ speech.ts   문장·단어 듣기
```

## 자주 막히는 곳

| 증상 | 해결 |
|---|---|
| 구글 연결 시 "액세스 차단됨" | 구글 클라우드 **대상 → 테스트 사용자**에 내 이메일이 있는지 확인 |
| "origin_mismatch" | 지금 주소(`http://localhost:3000` 또는 `https://아이디.github.io`)가 클라이언트의 **승인된 자바스크립트 원본**에 정확히 있는지 확인 |
| "드라이브 권한 두 가지를 모두 허용해야 해요" | 연결 창에서 체크 상자 두 개를 모두 선택 |
| "Google에서 확인하지 않은 앱" 경고 | 내가 만든 테스트 앱이라 정상 → **고급 → 영어 서재(으)로 이동** |
| 한 시간쯤 지나면 "구글 연결 시간이 끝났어요" | 보안상 정상. 띠의 **다시 연결**을 한 번 누르면 됨 (기록은 기기에 저장돼 있어 사라지지 않음) |
| 드라이브에서 고르기 창이 안 열림 | `.env.local`의 API 키·프로젝트 번호, API 키의 웹사이트 제한 주소 확인 |
| 단어를 눌렀는데 "API 키가 올바르지 않아요" | Gemini 키를 다시 입력 (aistudio.google.com) |
| 글자가 거의 안 나오는 PDF | 스캔본입니다. 3단계 PC 도우미의 글자 인식(OCR)에서 지원 예정 |

## 명령어 모음

```bash
npm run dev        # 개발 모드 실행 (http://localhost:3000)
npm run build      # 배포용 빌드 → out 폴더
npm run start      # 빌드한 out 폴더를 http://localhost:3000 으로 열기
npm run typecheck  # 코드 오류 검사
```
