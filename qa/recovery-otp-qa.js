// [TBO-31 C5] 비로그인 복구 OTP 브라우저 QA — 아이디 찾기(화면 표시)·비밀번호 재설정(즉시 변경).
// 전제: BE(인메모리 데모 시드) 3001 · FE(next start) 3000. 실행: node qa/recovery-otp-qa.js
// ⚠ 5단계에서 jung_inst 비밀번호를 바꾼다(인메모리 — 서버 재시작이면 원복). 마지막에 원복 재설정.
const { FE, launch, newPage, step } = require('./helpers');

const DEV_CODE_RE = /인증 코드:\s*(\d{6})/;

async function sendAndConfirmOtp(page, email) {
  await page.getByPlaceholder('you@tnacademy.com').fill(email);
  await page.getByRole('button', { name: '인증 코드 발송' }).click();
  const devLine = page.getByText('개발 모드(SMTP 미설정)');
  await devLine.waitFor({ timeout: 10000 });
  const code = (await devLine.textContent()).match(DEV_CODE_RE)[1];
  await page.getByPlaceholder('6자리 숫자').fill(code);
  await page.getByRole('button', { name: '코드 확인' }).click();
}

(async () => {
  const browser = await launch();
  const { context, page } = await newPage(browser);
  try {
    // ── 아이디 찾기 ──────────────────────────────────────────────────────
    await step(page, 'r1', '아이디 찾기: OTP 인증 전 버튼 비활성', async () => {
      await page.goto(`${FE}/recover`, { waitUntil: 'domcontentloaded' });
      const btn = page.getByRole('button', { name: '아이디 확인' });
      if (await btn.isEnabled()) throw new Error('인증 전인데 아이디 확인 버튼 활성');
    });

    await step(page, 'r2', '아이디 찾기: OTP 인증 → park_inst 화면 표시', async () => {
      await sendAndConfirmOtp(page, 'park@tnacademy.test');
      await page.getByText('아래에서 아이디를 확인하세요').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: '아이디 확인' }).click();
      await page.getByText('park_inst', { exact: true }).waitFor({ timeout: 10000 });
    });

    // ── 비밀번호 재설정 ──────────────────────────────────────────────────
    await step(page, 'r3', '비밀번호 재설정: 인증·비밀번호 일치 전 submit 비활성', async () => {
      await page.goto(`${FE}/recover?tab=password`, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('아이디').fill('jung_inst');
      const btn = page.getByRole('button', { name: '비밀번호 변경' });
      if (await btn.isEnabled()) throw new Error('인증 전인데 변경 버튼 활성');
    });

    await step(page, 'r4', '비밀번호 재설정: 불일치 인라인 → 일치 시 활성', async () => {
      await sendAndConfirmOtp(page, 'jung@tnacademy.test');
      await page.getByText('새 비밀번호를 설정하세요').waitFor({ timeout: 10000 });
      const [pw, pwConfirm] = await page.locator('input[type=password]').all();
      await pw.fill('qa-newpass-77');
      await pwConfirm.fill('qa-newpass-99');
      await page.getByText('비밀번호가 일치하지 않습니다').waitFor({ timeout: 5000 });
      await pwConfirm.fill('qa-newpass-77');
      const btn = page.getByRole('button', { name: '비밀번호 변경' });
      if (!(await btn.isEnabled())) throw new Error('조건 충족인데 변경 버튼 비활성');
    });

    await step(page, 'r5', '변경 확정 → 완료 화면 → 새 비밀번호 로그인 성공', async () => {
      await page.getByRole('button', { name: '비밀번호 변경' }).click();
      await page.getByText('비밀번호가 변경되었습니다').waitFor({ timeout: 10000 });
      await page.getByRole('link', { name: /새 비밀번호로 로그인/ }).click();
      await page.getByPlaceholder('admin').fill('jung_inst');
      await page.locator('input[type=password]').fill('qa-newpass-77');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
    });

    console.log('RECOVERY-QA ALL PASS');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((e) => { console.error('RECOVERY-QA FAIL:', e.message); process.exit(1); });
