# 영어 서재 (HBEL) — 프로젝트 안내 (Claude가 매번 자동으로 읽음)

## 사용자
- 휴밸런스 재활 운동센터 센터장, 초보 개발자. **항상 한국어로 답하고**, 어려운 용어는 쉽게 풀어서 설명.
- 코드는 생략 없이 바로 동작하는 전체 코드로 수정. 수정 후 `npm run typecheck`와 `npm run build`로 확인.

## 무엇을 만드는 앱인가
개인용 영어 학습 PWA. 본인이 올린 의학논문·전문서적 PDF(이후 동영상)로 공부.
- 단어를 누르면 뜻·한국 의학용어·어원, **영어 단어 바로 아래 한글 발음**(강세 음절 굵게), 문장 아래 **한글 번역**, Aa 메뉴로 각각 켜고 끔
- 단어장(학습 중/알아요) + FSRS 복습
- PC(크롬 설치)와 갤럭시(GitHub Pages 주소에서 설치) 둘 다 사용, 데이터는 구글 드라이브로 동기화

## 기술 구성
- Next.js 16 App Router, `output: 'export'`(정적 사이트), React 19, TypeScript. 서버 코드 없음 → API 라우트·서버 액션 쓰지 말 것.
- `useSearchParams`를 쓰는 페이지는 Suspense로 감쌀 것(정적 빌드 오류 방지).
- 하위 경로 배포 지원: 경로·파일 주소는 반드시 `withBase()`(src/lib/config.ts) 사용. manifest와 sw.js는 상대 경로.
- 저장: 기기 IndexedDB(idb-keyval)가 먼저, 구글 드라이브 appDataFolder에 `appdata.json`, `doc-<id>.json`, `ana-<id>.json` 동기화(updatedAt 비교 병합, 삭제는 `deleted` 표시). PDF 원본은 내 드라이브 › `영어서재` 폴더.
- 구글: GIS 토큰 방식(src/lib/google.ts), 권한은 **drive.file + drive.appdata 두 개만**. 전체 `drive` 권한은 절대 추가하지 말 것.
- AI: 브라우저에서 바로 호출(src/lib/claude.ts). 키는 각 기기 localStorage에만 저장(`LS_KEYS`). 결과는 문서별로 캐시해서 같은 문장은 다시 묻지 않음.
- PDF: pdfjs-dist 5(워커는 postinstall로 public에 복사), src/lib/pdf.ts
- 복습: ts-fsrs 5, src/lib/srs.ts
- 디자인 토큰·공통 스타일: src/app/globals.css (메인색 #0B6E69)

## 주요 파일
- src/lib: types.ts, config.ts, util.ts, google.ts, drive.ts, store.tsx(StoreProvider/useStore), claude.ts, pdf.ts, srs.ts, speech.ts
- src/components: AppShell, TabBar, AaMenu, Hangul, WordSheet, SyncBanner, ComingSoon, Icon
- src/app: 홈(page.tsx), setup, upload, reader, vocab, word, review, settings, grammar·pronounce·chat(2단계 자리)

## 보안 규칙 (꼭 지킬 것)
- `.env.local`은 GitHub에 올리지 않음(.gitignore에 있음). 키 값을 코드·커밋·채팅에 쓰지 말 것.
- `.env.local`의 `NEXT_PUBLIC_GOOGLE_API_KEY`는 **Google Picker 전용**(웹에 공개되는 값). 여기에 Gemini 등 다른 API를 허용하지 말 것.
- AI 키(Claude/Gemini)는 사용자가 앱 설정 화면에서 입력 → 그 기기에만 저장. 드라이브 동기화 데이터(AppData)에 넣지 말 것.
- 구글 클라우드 OAuth 앱은 '테스트' 상태 유지(앱 게시 금지).

## 실행
- `npm run dev` → http://localhost:3000 (구글 OAuth 원본이 3000번에 등록되어 있으므로 포트 바꾸지 말 것)
- 배포: main에 push → .github/workflows/deploy.yml 이 GitHub Pages에 자동 배포

## 다음 할 일
docs/NEXT_TASKS.md 참고. 한 번에 한 작업씩, 끝나면 그 파일의 체크 상자를 갱신.
