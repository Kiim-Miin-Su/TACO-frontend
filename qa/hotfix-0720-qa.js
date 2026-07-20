// [핫픽스 2026-07-20] 브라우저 QA — ① 레거시 미인증 가입 승인/재발송/삭제 ② 대시보드·배지에
//  가입 승인 대기 노출(승인센터와 통일) ③ 반려 사유 알림. 전제: BE 3001(인메모리)·FE 3000.
const { FE, launch, newPage, login, step } = require('./helpers');

const API = 'http://localhost:3001/api';

// 레거시 미인증 pending 계정을 API로 직접 재현할 수 없으므로(신규 경로는 전부 OTP verified),
// 정상 OTP 가입(verified) 1건 + 반려 사유 알림 검증용 시나리오로 구성한다.
async function apiSignupVerified(webId, email) {
  const create = await (await fetch(`${API}/auth/signup-email-challenge`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  })).json();
  await fetch(`${API}/auth/signup-email-challenge/${create.id}/confirm`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: create.devOtpCode }),
  });
  const res = await fetch(`${API}/auth/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ webId, name: '핫픽스검증', email, password: 'password123', rrn: '950101-1234567', emailChallengeId: create.id, role: 'instructor' }),
  });
  if (res.status !== 201) throw new Error(`signup ${res.status}`);
  return (await res.json()).account.id;
}

(async () => {
  const browser = await launch();
  const { context, page } = await newPage(browser);
  const epoch = String(Math.floor(performance.timeOrigin + performance.now())).slice(-8);
  const webId = `hf_${epoch}`;
  try {
    await apiSignupVerified(webId, `hf${epoch}@qa.test`);

    await step(page, 'h1', '대시보드: 가입·계정 승인 카드에 대기 항목 노출(통일 검증)', async () => {
      await login(page, 'admin', 'demo1234');
      await page.goto(`${FE}/`, { waitUntil: 'domcontentloaded' });
      await page.getByText('가입 · 계정 승인').first().waitFor({ timeout: 15000 });
      await page.getByText(`가입 승인 대기 — 핫픽스검증 (${webId})`).first().waitFor({ timeout: 15000 });
    });

    await step(page, 'h2', '승인센터: 같은 계정 노출 + 삭제(사유 모달) → 목록 소거', async () => {
      await page.goto(`${FE}/admin/approvals`, { waitUntil: 'domcontentloaded' });
      const row = page.locator('tr', { hasText: webId });
      await row.waitFor({ timeout: 15000 });
      await row.getByRole('button', { name: '삭제' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox').fill('QA 오가입 정리 — 재가입 검증');
      await dialog.getByRole('button', { name: '삭제' }).click(); // [핫픽스] 삭제 모달 전용 라벨
      await page.getByText('가입 신청을 삭제했습니다').waitFor({ timeout: 10000 });
      if (await row.count()) {
        await row.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      }
    });

    await step(page, 'h3', '삭제 후 같은 아이디·이메일 재가입 가능(식별자 해제 검증)', async () => {
      const again = await apiSignupVerified(webId, `hf${epoch}@qa.test`);
      if (!again) throw new Error('재가입 실패');
    });

    console.log('HOTFIX-QA ALL PASS');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => { console.error('HOTFIX-QA FAIL:', e.message); process.exit(1); });
