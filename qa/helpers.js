// qa/helpers.js — 브라우저 QA 하네스 공용 헬퍼 (B8 E4 C2)
// 전제: FE(next start) http://localhost:3000 · BE(인메모리 데모 시드) http://localhost:3001 기동 상태.
// Playwright는 전역 설치본을 절대경로 require — 저장소 의존성에 추가하지 않는다.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');

const FE = process.env.QA_FE_URL || 'http://localhost:3000';
const CHROMIUM_PATH = process.env.QA_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS_DIR = path.join(__dirname, 'shots'); // .gitignore 대상(비커밋)

async function launch() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  return chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
}

// 네이티브 dialog(alert/confirm/prompt) 감시 — 발생 = 실패 규약(DESIGN §5.5: 모달은 전부 role="dialog").
// 발생 즉시 dismiss하고 기록해 두면, step()이 단계 종료 시점에 실패로 승격한다.
function watchDialogs(page) {
  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push(`${d.type()}: ${d.message()}`);
    await d.dismiss().catch(() => {});
  });
  page.__qaDialogs = dialogs;
  return dialogs;
}

// 새 컨텍스트+페이지(역할별 세션 분리 — 토큰은 쿠키라 컨텍스트로 격리) + dialog 감시 부착.
async function newPage(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  watchDialogs(page);
  return { context, page };
}

// 스크린샷 — qa/shots/<name>.png (fullPage). 실패해도 시나리오는 계속(스크린샷은 보조 산출물).
async function shot(page, name) {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

// 로그인 폼: getByPlaceholder('admin')=아이디 · input[type=password] · 버튼 '로그인'(exact).
// 성공 판정은 URL이 아니라 "로그인 화면을 벗어남"(랜딩은 역할별로 다름 — admin=/admin/approvals 등).
async function login(page, webId, password) {
  await page.goto(`${FE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('admin').fill(webId);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForLoadState('domcontentloaded');
}

// step 로거 — 단계명 출력, 성공 시 스크린샷(<id>.png), 실패 시 FAIL 로그+스크린샷(FAIL-<id>.png)+throw.
// 단계 중 네이티브 dialog가 발생했으면(발생=실패) 성공했더라도 실패로 승격한다.
async function step(page, id, name, fn) {
  const tag = `[${id}] ${name}`;
  const before = page.__qaDialogs ? page.__qaDialogs.length : 0;
  try {
    await fn();
    if (page.__qaDialogs && page.__qaDialogs.length > before) {
      throw new Error(`네이티브 dialog 발생(발생=실패): ${page.__qaDialogs.slice(before).join(' | ')}`);
    }
    const file = await shot(page, id);
    console.log(`PASS ${tag} — shot: ${path.relative(process.cwd(), file)}`);
  } catch (err) {
    const file = await shot(page, `FAIL-${id}`);
    console.error(`FAIL ${tag} — ${err.message}`);
    console.error(`     스크린샷: ${file}`);
    throw err;
  }
}

const todayISO = () => {
  // 캘린더·이벤트 폼과 같은 로컬(KST 서버 기준) 날짜 — UTC 변환에 따른 하루 밀림 방지.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

module.exports = { FE, SHOTS_DIR, launch, newPage, watchDialogs, shot, login, step, todayISO };
