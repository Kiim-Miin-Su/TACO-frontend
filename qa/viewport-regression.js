// qa/viewport-regression.js — 뷰포트 가로 오버플로 회귀 (B8 E4 C2)
// admin 로그인 후 뷰포트 768/1024/1280/1440 × 화면 5종 = 20조합 각각:
//   가로 오버플로 없음(document.documentElement.scrollWidth <= clientWidth+1) 단정 + 스크린샷.
// 실패 조합이 있으면 목록을 출력하고 exit 1 (레이아웃 수정은 이 스크립트 범위 밖 — 보고만).
//
// 실행: node qa/viewport-regression.js  (전제: BE :3001 데모 시드 · FE :3000 기동 — /students/1은 시드 학생)
const { FE, launch, newPage, login, shot } = require('./helpers');

const VIEWPORTS = [768, 1024, 1280, 1440];
const SCREENS = ['/schedule', '/admin/approvals', '/students', '/payments', '/students/1'];
const HEIGHT = 900;

async function main() {
  const browser = await launch();
  const { page } = await newPage(browser, { viewport: { width: 1440, height: HEIGHT } });
  await login(page, 'admin', 'demo1234');

  const failures = [];
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: HEIGHT });
    for (const screen of SCREENS) {
      const name = `vp-${width}${screen.replace(/\//g, '-')}`;
      await page.goto(`${FE}${screen}`, { waitUntil: 'domcontentloaded' });
      // 데이터 렌더 안정화 — 네트워크 유휴 대기(캘린더 등 폴링성 요청은 타임아웃 시 무시하고 진행).
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const ok = m.scrollWidth <= m.clientWidth + 1;
      await shot(page, name);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${String(width).padStart(4)}px ${screen.padEnd(17)} scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`);
      if (!ok) failures.push({ screen, width, ...m });
    }
  }

  await browser.close();

  if (failures.length) {
    console.error(`\n가로 오버플로 실패 조합 ${failures.length}건:`);
    for (const f of failures) {
      console.error(`  - ${f.screen} @ ${f.width}px (scrollWidth=${f.scrollWidth} > clientWidth=${f.clientWidth}+1)`);
    }
    process.exit(1);
  }
  console.log(`\n뷰포트 회귀 ${VIEWPORTS.length * SCREENS.length}조합 전부 PASS (오버플로 0)`);
}

main().catch((err) => {
  console.error(`뷰포트 회귀 실행 실패: ${err.message}`);
  process.exit(1);
});
