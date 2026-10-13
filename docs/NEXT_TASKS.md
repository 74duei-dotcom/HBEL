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
- [ ] 문법: 내 자료 문장에서 문법 항목 뽑기 → 문법 목록/상세(설명·내 자료 예문·연습 문제) — 설계 화면 Grammar, GrammarDetail
- [ ] 발음: 문장 따라 읽기(쉐도잉) 녹음 → 평가(Azure 발음 평가 또는 Gemini 오디오 입력 검토) — Pronounce, PronounceList
- [ ] AI 대화(롤플레이): 환자 상담·학회 질의응답·논문 토론, 끝나면 표현 교정 결과 — Roleplay, RoleplayStart, RoleplayResult
- [ ] 실제 음성 TTS(Gemini Flash TTS 검토)로 문장 듣기 교체

## 3단계
- [ ] PC 도우미(Python, localhost:8765): 드라이브 데스크톱 폴더 감시, Whisper 영상 자막, 스캔 PDF 글자 인식(OCR), 영상 압축
- [ ] 동영상 리더 화면 (설계 Video)
- [ ] (선택) Capacitor로 APK 만들기 — Android용 OAuth 클라이언트 별도 필요
