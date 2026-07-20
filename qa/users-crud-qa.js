// [유저 관리 2026-07-20] 브라우저 QA — 리스트→행 클릭→비밀번호 재확인(sudo)→상세→수정→
//  직접 등록(Create 분리 버튼)→신규 계정 로그인. 전제: BE 3001(인메모리)·FE 3000.
const { FE, launch, newPage, login, step } = require('./helpers');

(async () => {
  const browser = await launch();
  const { context, page } = await newPage(browser);
  const epoch = String(Math.floor(performance.timeOrigin + performance.now())).slice(-8);
  try {
    await step(page, 'u1', '유저 관리 탭: 전 계정 리스트(활성·대기·반려 필터) 노출', async () => {
      await login(page, 'admin', 'demo1234');
      await page.goto(`${FE}/admin/users`, { waitUntil: 'domcontentloaded' });
      await page.getByText('유저 관리', { exact: false }).first().waitFor({ timeout: 15000 });
      await page.getByText('park_inst', { exact: true }).waitFor({ timeout: 15000 });
    });

    await step(page, 'u2', '행 클릭 → 비밀번호 재확인 게이트 → 오답 거절 → 정답 통과 → 상세', async () => {
      await page.getByText('park_inst', { exact: true }).click();
      await page.getByText('본인 확인').waitFor({ timeout: 15000 });
      await page.locator('input[type=password]').fill('wrong-pass');
      await page.getByRole('button', { name: '확인하고 계속' }).click();
      await page.getByText('비밀번호가 올바르지 않습니다').waitFor({ timeout: 10000 });
      await page.locator('input[type=password]').fill('demo1234');
      await page.getByRole('button', { name: '확인하고 계속' }).click();
      await page.getByText('박지훈 (park_inst)').waitFor({ timeout: 15000 });
      await page.getByText('주민등록번호(마스킹)').waitFor({ timeout: 5000 }); // 대표 전용 필드
    });

    await step(page, 'u3', '상세에서 수정: 전화번호 변경 → 저장 확인', async () => {
      await page.getByRole('button', { name: '수정' }).click();
      const phone = page.locator('input[type=tel]');
      const freshPhone = `010-7${epoch.slice(-3)}-${epoch.slice(-4)}`; // 회차별 고유값(서버 잔존 상태 무관)
      await phone.fill(freshPhone);
      await page.getByRole('button', { name: '저장' }).click();
      await page.getByText('저장했습니다').waitFor({ timeout: 10000 });
      await page.getByText(freshPhone).waitFor({ timeout: 5000 });
    });

    await step(page, 'u4', '리스트 복귀(클라 내비 — sudo 5분 유지, 재입력 없이 상세 재진입)', async () => {
      // ⚠ 전체 리로드(goto)는 설계상 sudo가 리셋된다(저장소 미사용 — 새로고침 시 재확인).
      //  클라이언트 내비(back)로 복귀해야 5분 유지가 검증된다.
      await page.goBack(); // 상세 → 리스트 (SPA 내비)
      await page.getByText('jung_inst', { exact: true }).click();
      await page.getByText('정유진 (jung_inst)').waitFor({ timeout: 15000 }); // 게이트 재요구 없음
    });

    await step(page, 'u5', 'Create 분리 버튼 → 직접 등록(매니저) → 리스트 반영', async () => {
      await page.goto(`${FE}/admin/users`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '+ 직접 등록' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/아이디/).first().waitFor({ timeout: 10000 }).catch(() => {});
      const inputs = dialog.locator('input');
      await inputs.nth(0).fill(`qa_direct_${epoch}`); // 아이디
      await dialog.getByText('사용 가능한 아이디입니다').waitFor({ timeout: 10000 });
      await dialog.locator('select').selectOption('manager');
      await inputs.nth(1).fill('QA직접등록');
      await dialog.locator('input[type=password]').nth(0).fill('qa-pass-1234');
      await dialog.locator('input[type=password]').nth(1).fill('qa-pass-1234');
      await dialog.getByRole('button', { name: '등록', exact: true }).click();
      await page.getByText('계정을 등록했습니다').waitFor({ timeout: 10000 });
      await page.getByText(`qa_direct_${epoch}`, { exact: true }).waitFor({ timeout: 10000 });
    });

    await step(page, 'u6', '신규 직접 등록 계정 즉시 로그인 가능', async () => {
      const fresh = await newPage(browser);
      await login(fresh.page, `qa_direct_${epoch}`, 'qa-pass-1234');
      await fresh.context.close();
    });

    console.log('USERS-CRUD-QA ALL PASS');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => { console.error('USERS-CRUD-QA FAIL:', e.message); process.exit(1); });
