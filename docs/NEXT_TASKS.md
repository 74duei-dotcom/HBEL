# 다음 작업 목록

순서대로 하나씩 진행. 각 작업은 끝나면 `- [x]`로 바꾸고, typecheck·build 통과와 화면 확인까지 마친 뒤 커밋.

---

## 작업 1. AI 제공자 선택: Claude 또는 Gemini  (완료)

### 목표
설정에서 **Claude / Gemini 중 하나**를 고르고, 고른 쪽 키로 단어 뜻·번역·한글 발음을 받는다. 지금까지 저장된 분석 캐시·단어장은 그대로 사용.

### 할 일
- [x] `src/lib/ai.ts` 새로 만들기: 공통 함수 `callAI(system, user, maxTokens)`, `testAIKey()`, `getProvider()/setProvider()`, `AIError`(종류: no-key, bad-key, rate-limit, network, overloaded, bad-response)
  - provider는 localStorage `el.aiProvider` (`'claude' | 'gemini'`, 기본 `'gemini'`)
  - Gemini 키는 localStorage `el.geminiKey` (LS_KEYS에 추가). Claude 키는 기존 `el.claudeKey` 그대로
- [x] Gemini 호출 구현 (브라우저에서 직접)
  - `POST https://generativelanguage.googleapis.com/v1beta/models/{모델}:generateContent`
  - 헤더 `x-goog-api-key: <키>` (키를 주소 뒤 `?key=`에 붙이지 말 것)
  - body: `systemInstruction`, `contents`, `generationConfig: { responseMimeType: 'application/json', maxOutputTokens, temperature: 0.2 }`
  - 모델 기본값 `gemini-3.8-flash`, `.env.local`의 `NEXT_PUBLIC_GEMINI_MODEL`로 변경 가능 (.env.local.example에도 추가). 구현 전에 https://ai.google.dev/gemini-api/docs/models 에서 현재 모델 이름 확인
  - 오류 코드 → AIError: 400(API_KEY_INVALID)/403 → bad-key, 429 → rate-limit("무료 한도: 잠시 후 다시"), 5xx → overloaded
- [x] `src/lib/claude.ts`의 `lookupWord`, `analyzeSentences`가 `callAI`를 쓰게 바꾸기 (프롬프트·JSON 처리·한글 발음 규칙은 그대로 유지). 파일 이름은 그대로 두거나 `analysis.ts`로 바꾸고 import 경로 모두 수정
- [x] 화면 수정: `src/app/setup/page.tsx`(1단계를 "AI 연결"로: 제공자 선택 → 키 입력 → 확인), `src/app/settings/page.tsx`(제공자 바꾸기, 각 키 입력/확인/가리기), `src/components/WordSheet.tsx`·`src/app/reader/page.tsx`의 오류 문구를 제공자 이름에 맞게
  - Gemini 안내 문구: "aistudio.google.com → Get API key 에서 만든 키. 무료 등급은 보낸 내용이 구글 서비스 개선에 쓰일 수 있으니 환자 정보는 올리지 마세요."
- [x] 확인: `npm run typecheck`, `npm run build`, 실제 Gemini 키로 PDF 한 쪽 분석·단어 뜻 확인, 제공자를 바꿔도 이전 캐시가 보이는지 확인
- [x] README.md의 "Claude 키" 안내를 "AI 키(Claude 또는 Gemini)"로 수정

### 하지 말 것
- `.env.local`의 Picker용 `NEXT_PUBLIC_GOOGLE_API_KEY`를 Gemini에 재사용하지 않기
- AI 키를 Drive 동기화 데이터에 넣지 않기

---

## 작업 2. 실제 사용 점검 (사용자와 함께)
- [x] 구글 연결 → PDF 올리기 → 드라이브 `영어서재` 폴더에 원본 생김 확인 (PC에서 확인 완료: 폴더 생성, 단어 뜻·저장·복습 카드 동작)
- [x] 단어 저장 → 다른 기기(휴대폰)에서 같은 단어 보임 확인 (갤럭시에서 작동 확인 완료)
- [x] 문제 생기면 화면·오류 메시지 보고 수정 (현재 남은 문제 없음)

## 작업 3. GitHub Pages 배포 + 갤럭시 설치  (완료)
- [x] README 3번 절차대로 (저장소 74duei-dotcom/HBEL 생성·배포 완료: https://74duei-dotcom.github.io/HBEL/)
- [x] 구글 클라우드: 승인된 원본 `https://74duei-dotcom.github.io`, Picker 키 웹사이트 제한 `https://74duei-dotcom.github.io/*` 추가 완료

---

## 2단계 (작업 1~3 끝난 뒤)
- [x] 문법: 내 자료 문장에서 문법 항목 뽑기 → 문법 목록/상세(설명·내 자료 예문·연습 문제) — 구현 완료(리더의 '문법' 버튼 → 노트에 저장 → /grammar 목록·상세·객관식 3문제). 실제 AI 키로 문장 분석 품질 확인은 사용자 점검 필요
- [x] 발음 쉐도잉: 내 자료 문장/직접 입력 → 원어민 소리 → 녹음 → Gemini 오디오 평가(점수·단어별·고칠 점) — 구현 완료(/pronounce). 실제 마이크 녹음 평가는 사용자 점검 필요
- [x] AI 대화(롤플레이): 상황 3개(환자 상담·학회 Q&A·논문 토론), 내 말 즉시 교정, 끝내기 후 정리(고칠 표현·외울 표현), 공부 중 단어 목표, 음성 입력/듣기 — 구현 완료(/chat). 실제 AI 키로 품질 확인은 사용자 점검 필요
- [x] 실제 음성 TTS: Gemini 음성(gemini-3.8-flash-tts, Kore)으로 문장·단어 듣기, 기기 IndexedDB에 캐시, 실패 시 기기 음성으로 대체, 설정에서 선택·소리 확인

## 3단계
- [x] 스캔 PDF 글자 인식(OCR): PC 도우미 대신 앱 안에서 처리(tesseract.js, 파일은 public/ocr 자체 호스팅, 글자 없는 쪽만 인식) — 업로드 화면의 "스캔본이면 글자 인식" 옵션. 실제 책 스캔본 품질·속도는 사용자 점검 필요
- [x] 강의 영상(파일 + 유튜브 주소): PC 도우미 대신 앱 안에서 처리 — 소리를 기기에서 뽑아(16kHz) 4분씩 Gemini가 영어 자막+시각으로 받아 적음(src/lib/video.ts), 영상 파일은 기기 IndexedDB에만 저장, 리더에 영상 플레이어·문장 누르면 그 장면·재생 따라 문장 이동. 실제 강의 영상 품질·시간은 사용자 점검 필요
- [x] 기본 문법 5형식(문법 노트에 처음부터 포함, src/lib/grammarBasics.ts): 직접 쓴 의학·재활 예문, 한글 번역, 고정 연습 문제 3개씩, 상태(알아요/공부 중)만 저장
- [x] 5형식 이어서(B): 리더 문법 창에 "N형식" 판정 + 성분별 표시(주어·동사·목적어…), 기본 문법 설명으로 연결. AI 판정은 성분 순서·원문 일치를 코드로 검사해 틀린 건 숨김(src/lib/grammar.ts checkPattern). 실제 AI 키로 판정 품질은 사용자 점검 필요
- [x] 5형식 한눈에 보기(C): 문법 노트 맨 위 카드 → 한 장 요약 화면(/grammar/?view=patterns, 형식별 공식·색 구분 예문·핵심 팁, 카드 누르면 상세)
- [x] 8품사 한눈에 보기(D): 문법 노트 카드 → /grammar/?view=parts (8개 품사 설명·예문 단어별 한글 발음·번역, src/lib/grammarBasics.ts POS_SUMMARY)
- [x] 알파벳 소리표: 홈·발음 연습 화면 카드 → /pronounce/?view=alphabet (글자 이름·단어 속 소리·팁, 같은 글자 다른 소리, 두 글자 소리; src/lib/alphabet.ts, src/components/AlphabetSheet.tsx)
- [ ] (선택) PC 도우미(Python): 드라이브 폴더 감시, 영상 압축 — 큰 영상(700MB 초과)이 필요해질 때만
- [ ] (선택) Capacitor로 APK 만들기 — Android용 OAuth 클라이언트 별도 필요

## 4단계 (기능 보강)
- [x] 단어장 Anki용 파일 내보내기 (src/lib/export.ts, 단어장 화면 버튼)
- [x] 전체 검색 /search (MiniSearch, 내 자료 문장 + 단어장, 결과 누르면 리더에서 그 문장으로 이동)
- [x] ESLint(eslint.config.mjs)·Vitest(tests/) 도입, 배포 전 typecheck·lint·test 자동 실행
- [x] 논문 DOI로 제목·저자·저널·연도 자동 채우기 (src/lib/doi.ts, Crossref) — 실제 논문 PDF로 점검 필요
- [x] 학습 통계 /stats (연속 학습일, 14일 저장·복습, 7일 복습 예정)
