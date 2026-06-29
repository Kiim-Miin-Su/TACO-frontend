import { redirect } from "next/navigation";

// 캘린더 탭 통합: 주간 표는 /calendar의 "표" 뷰로 흡수되어 일원화됨.
export default function Page() {
  redirect("/calendar");
}
