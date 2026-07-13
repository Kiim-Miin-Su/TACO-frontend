// 캘린더 → 이미지(PNG·JPEG) 내보내기. (브라우저 다운로드)
// [감사 C, 2026-07-02] xlsx(SheetJS) 내보내기 제거 — npm audit high(ReDoS, 패치 없음) +
//  유일 사용처 WeeklyTable(주간 표)이 캘린더 통합(TBO-03)으로 데드코드였음. 엑셀이 다시
//  필요해지면 exceljs 등 유지보수되는 라이브러리로 서버측(백엔드) 생성 권장.
import { toPng, toJpeg } from "html-to-image";

// 캘린더/표 DOM 노드를 이미지로 캡처해 다운로드(PNG 또는 JPEG).
// 화면에서 칸이 좁아 시간표가 잘 안 보이는 문제 → 캡처 직전 노드를 가로(랜드스케이프)
// 목표 폭으로 잠시 넓혀 컬럼·글자를 키운 뒤 고해상도로 캡처하고, 원래 스타일로 복원한다.
export async function exportNodeAsImage(
  node: HTMLElement,
  filename: string,
  type: "png" | "jpeg" = "png",
) {
  await document.fonts?.ready;
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(Math.max(node.scrollWidth, node.clientWidth, rect.width));
  const height = Math.ceil(Math.max(node.scrollHeight, node.clientHeight, rect.height));
  const opts = {
    backgroundColor: "#ffffff",
    pixelRatio: 3,
    cacheBust: true,
    width,
    height,
    style: { margin: "0", padding: "0" },
  };
  const dataUrl = type === "jpeg"
    ? await toJpeg(node, { ...opts, quality: 0.96 })
    : await toPng(node, opts);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
