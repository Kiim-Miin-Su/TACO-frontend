import { IconSearch, IconBell, IconPlus } from '../ui/icons';

export default function Topbar() {
  return (
    <header className="h-14 shrink-0 border-b bg-canvas flex items-center gap-3 px-5">
      <div className="relative w-80 max-w-[40vw]">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          className="input pl-8"
          placeholder="학생, 등록, 결제 검색…"
          aria-label="검색"
        />
      </div>
      <div className="flex-1" />
      <button className="btn btn-invisible" aria-label="알림">
        <IconBell />
      </button>
      <button className="btn btn-primary">
        <IconPlus />
        신규 등록
      </button>
    </header>
  );
}
