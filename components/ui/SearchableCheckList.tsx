'use client';

import { useMemo, useState } from 'react';

export type SearchableCheckListItem = {
  id: number;
  name: string;
  description?: string;
};

type SearchableCheckListProps = {
  items: SearchableCheckListItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  placeholder?: string;
  emptyMessage?: string;
};

/** 캘린더·수업 개설이 함께 쓰는 검색형 다중 선택 입력. */
export function SearchableCheckList({
  items,
  selected,
  onToggle,
  placeholder = '검색',
  emptyMessage = '검색 결과 없음',
}: SearchableCheckListProps) {
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.name} ${item.description ?? ''}`.toLocaleLowerCase('ko-KR').includes(normalized),
    );
  }, [items, query]);

  return (
    <div className="border rounded-md overflow-hidden">
      <input
        className="input h-9 w-full text-caption rounded-none border-0 border-b"
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="max-h-[192px] overflow-y-auto p-1 space-y-0.5">
        {filteredItems.length === 0 ? (
          <p className="text-caption text-fg-subtle text-center py-3">{emptyMessage}</p>
        ) : filteredItems.map((item) => {
          const checked = selected.has(item.id);
          return (
            <label
              key={item.id}
              className={`flex items-center gap-2 px-2 min-h-8 rounded cursor-pointer text-caption ${checked ? 'badge-accent' : 'hover:bg-canvas-subtle'}`}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(item.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.name}</span>
                {item.description && <span className="block truncate text-micro text-fg-subtle">{item.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
