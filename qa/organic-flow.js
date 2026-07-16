// qa/organic-flow.js — 유기 흐름 단일 시나리오 (29E E4 · B8 E4 C2)
// 가입 → 승인 → 코스 개설 → 강사 수업 요청 → 요청 승인 → 캘린더 반영 → 학생 등록(수강 포함)
// → 출결 → 정산 미리보기 → 이벤트 발행 → 강사 조회. 도메인 간 연결이 목적 — 순서 고정.
//
// 실행: node qa/organic-flow.js  (전제: BE :3001 인메모리 시드 · FE :3000 기동)
// 재실행 대비: 모든 신규 엔티티는 epoch 기반 유니크 값 — 인메모리 DB에 데이터가 남아도 충돌 없음.
// 각 단계 PASS/FAIL 로그 + 스크린샷(qa/shots/) · 실패 시 즉시 중단(exit 1) · 네이티브 dialog=실패.
const { FE, launch, newPage, login, step, todayISO } = require('./helpers');

const epoch = Date.now();
const digits = String(epoch);
const INST = {
  webId: `qa_inst_${epoch}`,
  password: 'QaPass123!',
  name: `qa강사_${epoch}`,
  email: `qa${epoch}@test.local`,
  phone: '010-9999-0000',
  university: 'QA대학교',
  major: 'QA전공',
  birthYear: '1995',
};
const COURSE = `qa코스_${epoch}`;
const STUDENT = `qa학생_${epoch}`;
const GUARDIAN = `qa보호자_${epoch}`;
// 전화 형식 010-1234-5678(lib/validation PHONE_KR_RE). 보호자 전화는 upsert-or-link 키 — epoch로 유니크.
const STUDENT_PHONE = `010-${digits.slice(-4)}-${digits.slice(-8, -4)}`;
const GUARDIAN_PHONE = `010-${digits.slice(-8, -4)}-${digits.slice(-4)}`;
const EVENT = `qa공지_${epoch}`;
const TODAY = todayISO();
const monthRange = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear(); const m = d.getMonth();
  return { from: `${y}-${p(m + 1)}-01`, to: `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}` };
};

async function main() {
  const browser = await launch();
  // 역할별 세션 분리(토큰=쿠키): guest(가입) / admin(대표) / inst(신규 강사)
  const guest = await newPage(browser);
  const admin = await newPage(browser);
  const inst = await newPage(browser);

  // ── 1. [가입] 신규 강사 가입 + 개발 모드 인증 링크로 이메일 인증 ──
  await step(guest.page, '01-signup', '가입 — 신규 강사 가입 신청 + 이메일 인증(devVerifyLink)', async () => {
    const p = guest.page;
    await p.goto(`${FE}/signup`, { waitUntil: 'domcontentloaded' });
    await p.getByPlaceholder('jiwon_kim').fill(INST.webId);
    await p.getByPlaceholder('김지원').fill(INST.name);
    await p.getByPlaceholder('you@tnacademy.com').fill(INST.email);
    await p.locator('input[type=password]').fill(INST.password);
    await p.getByPlaceholder('010-1234-5678').fill(INST.phone);
    await p.getByPlaceholder('서울대학교').fill(INST.university);
    await p.getByPlaceholder('수학교육과').fill(INST.major);
    await p.getByPlaceholder('1998').fill(INST.birthYear);
    // 신청 역할 select 기본값 = 강사(instructor) — 그대로 둔다.
    await p.getByRole('button', { name: '가입 신청', exact: true }).click();
    await p.getByText('가입 신청 완료').waitFor({ timeout: 15000 });
    // 완료 화면의 개발 모드 인증 링크(done.devVerifyLink — 화면에 렌더됨) 클릭 → 이메일 인증까지.
    const link = p.locator('a[href^="/verify-email"]');
    await link.waitFor({ timeout: 5000 });
    await link.click();
    await p.waitForURL(/\/verify-email/, { timeout: 10000 });
    const ok = p.locator('div.text-success');
    const err = p.locator('div.text-danger');
    await ok.or(err).first().waitFor({ timeout: 15000 });
    if (await err.count()) throw new Error(`이메일 인증 실패: ${(await err.first().innerText()).trim()}`);
  });

  // ── 2. [승인] admin 로그인 → 승인센터 가입 대기에서 방금 계정 승인(강사 역할) ──
  await step(admin.page, '02-approve-signup', '승인 — 대표가 가입 승인(강사 역할)', async () => {
    const p = admin.page;
    await login(p, 'admin', 'demo1234');
    // admin 랜딩 = /admin/approvals — URL이 아닌 화면 요소로 판정.
    await p.getByText('가입 승인 대기', { exact: false }).first().waitFor({ timeout: 15000 });
    const row = p.locator('tr', { hasText: INST.webId }).first();
    await row.waitFor({ timeout: 10000 });
    await row.getByText('완료').waitFor({ timeout: 10000 }); // 이메일 인증 완료 표시(미완료면 승인 비활성)
    // 역할 지정 select 기본값 = 신청 역할(강사) — 그대로 승인.
    await row.getByRole('button', { name: '승인', exact: true }).click();
    await p.getByText('승인했습니다.').waitFor({ timeout: 10000 });
  });

  // ── 3. [코스 개설] admin이 신규 강사 담당 코스 생성 ──
  await step(admin.page, '03-create-course', '코스 개설 — 담당 강사=신규 강사', async () => {
    const p = admin.page;
    await p.goto(`${FE}/admin/courses`, { waitUntil: 'domcontentloaded' });
    const form = p.locator('form', { hasText: '코스명' }).first();
    await form.getByPlaceholder('SAT Reading 정규').fill(COURSE);
    await form.getByPlaceholder('50000').fill('50000'); // 강사 시급 — 정산 산정 근거
    // 과목: 첫 실제 옵션(빈 '선택' 제외 아무거나) / 담당 강사: 신규 강사 이름으로 선택.
    const subjectSel = form.locator('select').nth(0);
    await subjectSel.locator('option').nth(1).waitFor({ state: 'attached', timeout: 10000 }); // <option>은 visible 판정 불가 — attached로 대기
    await subjectSel.selectOption({ index: 1 });
    const instructorSel = form.locator('select').nth(1);
    await instructorSel.locator(`option:text-is("${INST.name}")`).waitFor({ state: 'attached', timeout: 10000 });
    await instructorSel.selectOption({ label: INST.name });
    await form.getByRole('button', { name: '코스 추가', exact: true }).click();
    // 목록 자동 갱신(qk.courses invalidate)으로 새 코스 행 확인.
    await p.getByRole('link', { name: COURSE, exact: true }).waitFor({ timeout: 10000 });
  });

  // ── 4. [강사 요청] 신규 강사 로그인 → /schedule → + 스케줄 추가 → 승인 요청 보내기 ──
  await step(inst.page, '04-instructor-request', '강사 요청 — 본인 코스 수업 승인 요청', async () => {
    const p = inst.page;
    await login(p, INST.webId, INST.password);
    // 가입 계정은 must_change_password 아님 — 강제 변경 화면이 뜨면 규약 위반 여부를 로그로 남긴다.
    if (p.url().includes('/account/security')) {
      console.log('     주의: 첫 로그인 강제 비밀번호 변경 화면 감지 — 가입 계정은 must_change_password가 아니어야 정상. 로그만 남기고 계속 진행.');
    }
    await p.goto(`${FE}/schedule`, { waitUntil: 'domcontentloaded' }); // → /calendar 리다이렉트
    const addBtn = p.getByRole('button', { name: /\+ 스케줄 추가/ });
    await addBtn.waitFor({ timeout: 20000 });
    await addBtn.click();
    const modal = p.getByRole('dialog'); // ModalShell — 모달은 전부 role="dialog"
    await modal.waitFor({ timeout: 10000 });
    // 본인 코스 선택(강사는 내 코스만 노출) — 옵션 텍스트 "코스명 · 과목명"에서 코스명으로 매칭.
    const courseSel = modal.locator('select').first();
    const opt = courseSel.locator('option', { hasText: COURSE });
    await opt.waitFor({ state: 'attached', timeout: 10000 });
    await courseSel.selectOption(await opt.getAttribute('value'));
    // 날짜=오늘(기본) · 시간=기본(16:00~코스 진행시간) 그대로 — '승인 요청 보내기' 제출.
    await modal.getByRole('button', { name: '승인 요청 보내기', exact: true }).click();
    await p.getByText('승인 요청을 보냈습니다').waitFor({ timeout: 15000 }); // 접수 메시지
  });

  // ── 5. [요청 승인] admin 승인센터 — 수업 요청 행(tr[role=button]) 클릭 → 모달에서 승인 ──
  await step(admin.page, '05-approve-request', '요청 승인 — 승인센터 행 클릭 → 모달 승인', async () => {
    const p = admin.page;
    await p.goto(`${FE}/admin/approvals`, { waitUntil: 'domcontentloaded' });
    await p.getByText('수업·가용시간 변경 요청 승인 대기', { exact: false }).waitFor({ timeout: 15000 });
    const row = p.locator('tr[role="button"]', { hasText: INST.name }).first();
    await row.waitFor({ timeout: 10000 });
    await row.click();
    const modal = p.getByRole('dialog');
    await modal.waitFor({ timeout: 10000 });
    await modal.getByRole('button', { name: '승인', exact: true }).click();
    await p.getByText('캘린더에 세션이 생성되었습니다').waitFor({ timeout: 15000 });
  });

  // ── 6. [캘린더 반영] admin /schedule 수업 리스트 패널에서 해당 수업 확인 ──
  await step(admin.page, '06-calendar-visible', '캘린더 반영 — 수업 리스트에 신규 수업 표시', async () => {
    const p = admin.page;
    await p.goto(`${FE}/schedule`, { waitUntil: 'domcontentloaded' });
    const panel = p.locator('div.card', { hasText: '수업 리스트' }).first();
    await panel.waitFor({ timeout: 20000 });
    await panel.getByText(COURSE).first().waitFor({ timeout: 15000 });
  });

  // ── 7. [학생 등록] /students 원자 등록 폼(학생+보호자+수강) — 신규 코스 수강까지 한 번에 ──
  await step(admin.page, '07-register-student', '학생 등록 — 보호자 포함 원자 등록 + 신규 코스 수강', async () => {
    const p = admin.page;
    await p.goto(`${FE}/students`, { waitUntil: 'domcontentloaded' });
    await p.getByRole('button', { name: '+ 학생 등록', exact: true }).click();
    const form = p.locator('form', { hasText: '학생 정보' }).first();
    await form.waitFor({ timeout: 10000 });
    await form.getByPlaceholder('김서연').fill(STUDENT);
    await form.getByPlaceholder('11', { exact: true }).fill('11'); // 학년
    await form.getByPlaceholder('010-0000-0000', { exact: true }).fill(STUDENT_PHONE); // 학생 연락처
    // 등록 코스 (선택) — 같은 폼에서 신규 코스 수강까지(원자 등록 command).
    const enrollSel = form.locator('select:has(option:text-is("— 미등록 —"))');
    await enrollSel.locator(`option:text-is("${COURSE}")`).waitFor({ state: 'attached', timeout: 10000 });
    await enrollSel.selectOption({ label: COURSE });
    // 학부모(결제·연락 주체) — 이름·전화. 전화는 유니크(같은 번호면 기존 보호자 자동 연결이라 회피).
    await form.getByPlaceholder('김미경').fill(GUARDIAN);
    await form.getByPlaceholder('같은 번호는 기존 보호자와 자동 연결').fill(GUARDIAN_PHONE);
    await form.getByRole('button', { name: '학생 등록', exact: true }).click();
    await form.getByText('등록 완료').waitFor({ timeout: 15000 });
    // 목록에서 학생 행 + 수강 코스 표기까지 확인(수강 등록 성공 검증).
    const row = p.locator('tr', { hasText: STUDENT }).first();
    await row.waitFor({ timeout: 10000 });
    await row.getByText(COURSE).waitFor({ timeout: 10000 });
  });

  // ── 8. [출결] 수업 리스트 → 상세 패널 링크로 /sessions/:id 진입 → 학생 출석 마킹 ──
  await step(admin.page, '08-attendance', '출결 — 수업 상세에서 학생 출석 1건 마킹', async () => {
    const p = admin.page;
    await p.goto(`${FE}/schedule`, { waitUntil: 'domcontentloaded' });
    const panel = p.locator('div.card', { hasText: '수업 리스트' }).first();
    const item = panel.locator('button', { hasText: COURSE }).first();
    await item.waitFor({ timeout: 20000 });
    await item.click(); // 리스트 클릭 = 세션 선택 → 상세 패널
    const detailLink = p.getByTitle('수업 상세 페이지로 — 학생 출결 관리');
    await detailLink.waitFor({ timeout: 10000 });
    await detailLink.click();
    await p.waitForURL(/\/sessions\/\d+/, { timeout: 15000 }); // 강의 상세 페이지(/sessions/:id)
    await p.getByText('학생 출결 · 피드백', { exact: false }).waitFor({ timeout: 15000 });
    const stuRow = p.locator('div.p-4', { hasText: STUDENT }).first();
    await stuRow.waitFor({ timeout: 10000 });
    await stuRow.getByRole('button', { name: '출석', exact: true }).click();
    // 저장 후 AttMarker가 배지(출석)+수정 버튼으로 전환 — 마킹 반영 확인.
    await stuRow.locator('span.badge', { hasText: '출석' }).waitFor({ timeout: 10000 });
  });

  // ── 9. [정산 미리보기] /payouts — 신규 강사 선택·기간 설정 → 미리보기 렌더 확인 ──
  await step(admin.page, '09-payout-preview', '정산 미리보기 — 신규 강사·이번 달 기간(0원=시수 0 정상)', async () => {
    const p = admin.page;
    await p.goto(`${FE}/payouts`, { waitUntil: 'domcontentloaded' });
    const form = p.locator('form', { hasText: '강사 *' }).first();
    await form.waitFor({ timeout: 15000 });
    const instSel = form.locator('select').first();
    await instSel.locator(`option:text-is("${INST.name}")`).waitFor({ state: 'attached', timeout: 10000 });
    await instSel.selectOption({ label: INST.name });
    const { from, to } = monthRange(); // 기간 설정(이번 달 1일~말일 — 기본값과 동일하지만 명시 입력)
    await form.locator('input[type=date]').nth(0).fill(from);
    await form.locator('input[type=date]').nth(1).fill(to);
    // 산정 미리보기 패널 — 적격 수업이 있으면 "미리보기 — …", 미래 수업뿐(시수 0)이면 대상 없음 문구.
    await p.getByText(/미리보기 — 적격 수업|해당 기간에 정산 대상/).waitFor({ timeout: 15000 });
  });

  // ── 10. [이벤트 발행] /schedule 스트립 '+ 학원 일정' 인라인 폼으로 공지 발행 ──
  await step(admin.page, '10-publish-event', '이벤트 발행 — 학원 일정 스트립 인라인 폼(공지·오늘)', async () => {
    const p = admin.page;
    await p.goto(`${FE}/schedule`, { waitUntil: 'domcontentloaded' });
    const strip = p.locator('[data-academy-events]');
    await strip.waitFor({ timeout: 20000 });
    await strip.getByRole('button', { name: '+ 학원 일정', exact: true }).click();
    const form = p.locator('[data-event-inline-form] form');
    await form.waitFor({ timeout: 10000 });
    await form.getByPlaceholder('여름 특강 등록 시작').fill(EVENT); // 제목 · 유형 기본=공지(notice)
    await form.locator('input[type=date]').first().fill(TODAY); // 시작일=오늘(종료일 생략=시작일)
    await form.getByRole('button', { name: '이벤트 발행', exact: true }).click();
    // 발행 후 폼 접힘 + 스트립 칩으로 즉시 확인(현재 보이는 기간과 겹침 — 오늘).
    await strip.getByText(EVENT).waitFor({ timeout: 15000 });
  });

  // ── 11. [강사 조회] 신규 강사 /schedule — 본인 승인 수업 + 학원 일정 스트립 확인 ──
  await step(inst.page, '11-instructor-view', '강사 조회 — 본인 수업 표시 + 학원 일정 스트립 노출', async () => {
    const p = inst.page;
    await p.goto(`${FE}/schedule`, { waitUntil: 'domcontentloaded' });
    const panel = p.locator('div.card', { hasText: '수업 리스트' }).first();
    await panel.waitFor({ timeout: 20000 });
    await panel.getByText(COURSE).first().waitFor({ timeout: 15000 }); // 본인 승인된 수업
    const strip = p.locator('[data-academy-events]');
    await strip.waitFor({ timeout: 15000 }); // 학원 일정 스트립 노출
    await strip.getByText(EVENT).waitFor({ timeout: 10000 }); // 방금 발행한 공지
  });

  await browser.close();
  console.log(`\n유기 흐름 11단계 전부 PASS — epoch=${epoch} (강사 ${INST.webId} · 코스 ${COURSE} · 학생 ${STUDENT} · 공지 ${EVENT})`);
}

main().catch((err) => {
  console.error(`\n유기 흐름 중단(실패 시 즉시 중단 규약): ${err.message}`);
  process.exit(1);
});
