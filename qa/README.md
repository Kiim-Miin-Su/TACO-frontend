# qa/ — 브라우저 QA 하네스 (B8 E4 C2)

Playwright(chromium)로 실제 브라우저에서 유기 흐름 시나리오와 뷰포트 회귀를 검증한다.
단위 테스트(vitest)가 못 잡는 도메인 간 연결(가입→승인→코스→요청→캘린더→학생→출결→정산→이벤트)을 통짜로 태운다.

## 전제

- **서버 2개 기동 상태에서 실행한다** (하네스는 서버를 띄우지 않는다):
  - BE `http://localhost:3001` — 인메모리 데모 시드(재시작 시 리셋). 대표 계정 `admin` / `demo1234`.
  - FE `http://localhost:3000` — production `next start`.
- **Playwright**: 전역 설치본을 절대경로로 require한다(저장소 의존성 아님).
  - 모듈: `/home/claude/.npm-global/lib/node_modules/playwright`
  - chromium 바이너리: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  - 다른 환경에서는 환경변수로 오버라이드: `QA_FE_URL`(FE 주소), `QA_CHROMIUM`(chromium 경로).
- 시나리오는 인메모리 DB에 데이터를 남긴다 — **서버를 재시작하지 말 것**(다른 검증이 이어질 수 있음).
  모든 신규 값은 epoch 기반 유니크(`qa_inst_<epoch>` 등)라 재실행해도 충돌하지 않는다.

## 실행법

```bash
node qa/organic-flow.js         # 유기 흐름 11단계 — 전부 PASS면 exit 0, 실패 시 즉시 중단 exit 1
node qa/viewport-regression.js  # 768/1024/1280/1440 × 5화면 = 20조합 가로 오버플로 단정 — 실패 목록 출력 시 exit 1
```

## 파일

| 파일 | 역할 |
| --- | --- |
| `helpers.js` | 공용: `launch()`(전역 chromium), `login(page, webId, password)`, `shot(page, name)`, `step()` 로거(단계명 출력·실패 시 스크린샷+throw), 네이티브 dialog 감시(발생=실패 규약 — 앱 모달은 전부 `role="dialog"`) |
| `organic-flow.js` | 유기 흐름 단일 시나리오(29E E4): ① 가입+이메일 인증(devVerifyLink) ② 대표 가입 승인 ③ 코스 개설(담당=신규 강사) ④ 강사 수업 승인 요청 ⑤ 승인센터 요청 승인 ⑥ 캘린더 반영 확인 ⑦ 학생+보호자+수강 원자 등록 ⑧ 수업 상세 출석 마킹 ⑨ 정산 미리보기(미래 수업=시수 0도 PASS) ⑩ 학원 일정 스트립 공지 발행 ⑪ 강사 계정으로 본인 수업+일정 스트립 확인 |
| `viewport-regression.js` | admin 로그인 후 `/schedule` `/admin/approvals` `/students` `/payments` `/students/1` × 뷰포트 4종: `scrollWidth <= clientWidth+1` 단정 + 스크린샷 |

## 스크린샷

- `qa/shots/`에 저장된다 — **비커밋**(.gitignore). 단계별 성공 샷(`01-signup.png` …)과
  실패 샷(`FAIL-<단계>.png`), 뷰포트 샷(`vp-768-schedule.png` …)이 남는다.

## 판정 규약

- 화면 요소로 판정한다(URL 아님 — 로그인 랜딩이 역할별로 다름: admin=승인센터, 강사=홈).
- 네이티브 `alert/confirm/prompt` 발생 = 해당 단계 실패(DESIGN §5.5 — 모달은 전부 ModalShell `role="dialog"`).
- organic-flow는 실패 단계에서 즉시 중단하고 exit 1. viewport-regression은 20조합을 끝까지 돌고
  실패 조합 목록을 출력한 뒤 exit 1(레이아웃 수정은 하네스 범위 밖 — 보고용).
