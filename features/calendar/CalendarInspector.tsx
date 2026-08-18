"use client";
// ═══════════════════════════════════════════════════════════════════════════
// [TBO-104 2A] Calendar Inspector — Figma main `7104:715` 대응 단일 우측 shell.
// 종전 우측 5개 독립 카드(ResourcePanel / ParticipantsCard / ResourceDetailCard /
// SessionListPanel / SessionDetailPanel)를 한 Inspector의 탭 내부 조각으로 수렴한다.
//  - Resources: 과목·강사·학생·강의실·수업·가용시간 6종 전환 + 검색·정렬·현재 결과 전체선택.
//    행 클릭 = pane 필터 토글(캘린더 즉시 반영 — 양방향 highlight의 Inspector→캘린더 방향),
//    ⓘ = 상세 카드(Detail 탭). 과목은 manager+ 인라인 추가/삭제(중앙 mutation 훅 → 무효화 refetch).
//  - Detail: 선택 세션 상세(SessionDetailPanel — SessionEditFields/ColorPicker 인라인 편집 포함)
//    + 참여자(ParticipantsCard) + 유저 카드(ResourceDetailCard). 캘린더 셀 클릭 시 이 탭이
//    자동 활성화된다(캘린더→Inspector 방향).
//  - Activities: 기간·필터 결과 수업 리스트(날짜순/그룹) — 클릭 시 캘린더 선택·기간 이동.
//  - Conflicts: 선택 세션의 현재 시간표 기준 서버 충돌 재검사(read-only).
//  - Changes: audit 변경 이력(관리자).
// 상태 사본 금지 — pane 필터는 dispatch로만 바꾸고 선택 상태(detailId/infoTarget)는 부모 소유를
// 그대로 사용한다. 서버 상태는 기존 Query 훅(cache)만 소비하며 Inspector 자체 fetch 상태를 두지 않는다.
// 색 정책: 표시 색 = session.color(오버라이드) ?? course.color ?? subject 폴백(backend 443 단일 코얼레스).
// 저장은 SessionEditFields의 ColorPicker(PATCH color)를 그대로 재사용한다.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type Dispatch, type RefObject } from "react";
import type { Room, ScheduleResource, ScheduleResources, ScheduleRow, AvailabilityBlock } from "@/types";
import type { SchedulePatchBody } from "@/lib/api";
import type { CalendarPanesAction, CalendarPaneState } from "@/lib/domain/calendar-panes";
import type { ListGroupBy, SplitDim } from "@/lib/domain/lantiv";
import { WEEKDAYS_KO as WD } from "@/lib/domain/schedule";
import { AVAILABILITY_KIND_LABEL } from "@/lib/domain/approvals";
import { formatScheduleConflicts } from "@/lib/domain/conflict-messages";
import { apiErrorMessage } from "@/lib/api-error";
import { scheduleResourceName } from "@/lib/domain/schedule-resources";
import { useCreateSubject, useRemoveSubject, useInstructors, useSubjects, useSessionConflictCheck } from "@/lib/queries";
import { SessionListPanel } from "./SessionListPanel";
import { SessionDetailPanel } from "./SessionDetailPanel";
import { ResourceDetailCard } from "./ResourceDetailCard";
import { ParticipantsCard } from "./ParticipantsCard";
import { ChangeHistory } from "./ChangeHistory";
import { EmptyState } from "@/components/ui";

type InspectorTab = "resources" | "detail" | "activities" | "conflicts" | "changes";
type ResourceKind = "subject" | "instructor" | "student" | "room" | "session" | "availability";
type FilterableKind = Exclude<ResourceKind, "session" | "availability">;

const RESOURCE_META: Record<ResourceKind, { icon: string; label: string }> = {
  subject: { icon: "📚", label: "과목" },
  instructor: { icon: "👓", label: "강사" },
  student: { icon: "🎓", label: "학생" },
  room: { icon: "🚪", label: "강의실" },
  session: { icon: "📅", label: "수업" },
  availability: { icon: "⏱", label: "가용시간" },
};
const FILTER_KEY: Record<FilterableKind, "subjectIds" | "instructorIds" | "studentIds" | "roomIds"> = {
  subject: "subjectIds",
  instructor: "instructorIds",
  student: "studentIds",
  room: "roomIds",
};

export function CalendarInspector({
  pane, dispatchPanes, resources, rooms, subjects,
  isInstructor, canManage, canAdd,
  colorOf, listRows, listGrouped, listGroupDim, onToggleListGrouped,
  detailRow, onPickSession, listEmptyHint,
  cardTarget, onSelectResource,
  onPatch, onDelete, onOpenModal, onSaved, onMsg, onAddScheduleFor,
  allBlocks, detailAnchorRef,
}: {
  pane: CalendarPaneState;
  dispatchPanes: Dispatch<CalendarPanesAction>;
  resources: ScheduleResources | null;
  rooms: Room[];
  subjects: Array<{ id: number; name: string; color?: string }>;
  isInstructor: boolean;
  canManage: boolean;
  canAdd: boolean;
  colorOf: (r: ScheduleRow) => string;
  listRows: ScheduleRow[];
  listGrouped: boolean;
  listGroupDim: Exclude<ListGroupBy, "none">;
  onToggleListGrouped: () => void;
  detailRow: ScheduleRow | null;
  onPickSession: (r: ScheduleRow) => void;
  listEmptyHint?: string;
  cardTarget: ScheduleResource | null;
  onSelectResource: (r: ScheduleResource | null) => void;
  onPatch: (r: ScheduleRow, patch: SchedulePatchBody, label: string) => void;
  onDelete: (r: ScheduleRow) => void;
  onOpenModal: (r: ScheduleRow) => void;
  onSaved: () => void;
  onMsg: (m: string) => void;
  onAddScheduleFor?: (owner: ScheduleResource | null) => void;
  allBlocks: AvailabilityBlock[];
  detailAnchorRef: RefObject<HTMLDivElement | null>;
}) {
  // Inspector 로컬 UI 상태(탭·검색·정렬)만 소유한다 — 필터/선택 데이터의 사본은 만들지 않는다.
  const [tab, setTab] = useState<InspectorTab>("resources");
  const [kind, setKind] = useState<ResourceKind>(isInstructor ? "room" : "subject");
  const [q, setQ] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  const createSubjectM = useCreateSubject();
  const removeSubjectM = useRemoveSubject();
  // 과목 리스트는 캘린더 조인 파생(subjects prop — course가 있는 과목만)이 아니라 **전체 카탈로그**가
  // 요구(1.10.2 "현재 존재하는 전체 과목 리스트업")다. 방금 추가한 코스 없는 과목도 즉시 보여야 하므로
  // useSubjects(카탈로그 SSOT)를 목록 원본으로, 색은 캘린더 파생 색을 조인한다.
  const { data: subjectCatalog = [] } = useSubjects();
  const { data: allInstructors = [] } = useInstructors();
  const actorName = (id: number) => allInstructors.find((i) => Number(i.id) === id)?.name ?? `관리자 #${id}`;

  // 캘린더 셀 클릭(부모 detailId 변경) → Detail 탭 자동 전환(캘린더→Inspector 양방향의 한 방향).
  const focusId = detailRow?.id ?? null;
  useEffect(() => {
    if (focusId != null) setTab("detail");
  }, [focusId]);

  const conflictsQ = useSessionConflictCheck(detailRow, tab === "conflicts" && canManage);

  // 강사는 타인 리소스 목록·필터 차원이 아예 없다(CSS hide가 아니라 렌더 트리에서 0 — 역할 경계 규칙).
  const kinds: ResourceKind[] = isInstructor
    ? ["room", "subject", "session", "availability"]
    : ["subject", "instructor", "student", "room", "session", "availability"];

  const kindRows = useMemo<Array<{ id: number; name: string; color?: string; sub?: string; resource?: ScheduleResource }>>(() => {
    if (kind === "subject") {
      const colorById = new Map(subjects.map((s) => [s.id, s.color] as const));
      return subjectCatalog.map((s) => ({ id: Number(s.id), name: s.name, color: colorById.get(Number(s.id)) }));
    }
    if (kind === "instructor") return (resources?.instructors ?? []).map((r) => ({ id: Number(r.id), name: scheduleResourceName(r), color: r.color, sub: r.sub, resource: r }));
    if (kind === "student") return (resources?.students ?? []).map((r) => ({ id: Number(r.id), name: scheduleResourceName(r), color: r.color, sub: r.sub, resource: r }));
    if (kind === "room") return (resources?.rooms ?? []).map((r) => ({ id: Number(r.id), name: scheduleResourceName(r), color: r.color, sub: r.sub, resource: r }));
    return [];
  }, [kind, subjects, subjectCatalog, resources]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle ? kindRows.filter((r) => r.name.toLowerCase().includes(needle)) : kindRows;
    const sorted = [...base].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return sortDesc ? sorted.reverse() : sorted;
  }, [kindRows, q, sortDesc]);

  const filterable = kind !== "session" && kind !== "availability";
  const filterKey = filterable ? FILTER_KEY[kind as FilterableKind] : null;
  const pickedIds = useMemo(() => (filterKey ? pane.filters[filterKey] : []), [filterKey, pane.filters]);
  const picked = useMemo(() => new Set(pickedIds), [pickedIds]);
  const setFilterValues = (values: number[]) => {
    if (!filterKey) return;
    dispatchPanes({ type: "pane/set-resource-filter", paneId: pane.id, filter: filterKey, values });
  };

  // 가용시간: pane 필터(강사·학생·강의실)에 걸린 owner들의 블록 — 없으면 전체(관리자) / 표시 제한(강사).
  const availabilityRows = useMemo(() => {
    if (kind !== "availability") return [];
    const owners: Array<{ type: SplitDim; id: number }> = [
      ...pane.filters.instructorIds.map((id) => ({ type: "instructor" as const, id })),
      ...pane.filters.studentIds.map((id) => ({ type: "student" as const, id })),
      ...pane.filters.roomIds.map((id) => ({ type: "room" as const, id })),
    ];
    const scoped = owners.length
      ? allBlocks.filter((b) => owners.some((o) => b.ownerType === o.type && Number(b.ownerId) === o.id))
      : allBlocks;
    const nameOf = (b: AvailabilityBlock) => {
      const pool = b.ownerType === "instructor" ? resources?.instructors : b.ownerType === "student" ? resources?.students : resources?.rooms;
      const hit = pool?.find((r) => Number(r.id) === Number(b.ownerId));
      return hit ? scheduleResourceName(hit) : `${b.ownerType} #${b.ownerId}`;
    };
    const needle = q.trim().toLowerCase();
    return scoped
      .map((b) => ({ block: b, ownerName: nameOf(b) }))
      .filter((x) => !needle || x.ownerName.toLowerCase().includes(needle))
      .sort((a, b) => (a.ownerName.localeCompare(b.ownerName, "ko") || a.block.weekday - b.block.weekday || a.block.startTime.localeCompare(b.block.startTime)));
  }, [kind, allBlocks, pane.filters, resources, q]);

  const tabs: Array<{ key: InspectorTab; label: string }> = [
    { key: "resources", label: "리소스" },
    { key: "detail", label: "상세" },
    { key: "activities", label: "수업" },
    ...(canManage ? ([{ key: "conflicts", label: "충돌" }, { key: "changes", label: "변경" }] as const) : []),
  ];

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    try {
      // 과목 코드는 사용자 입력에서 제거(요구 1.7) — 이름 기반 파생. 서버 unique/정규화 정책은 Sprint 5에서 확정.
      await createSubjectM.mutateAsync({ code: name.toLowerCase().replace(/\s+/g, "-"), name });
      setNewSubject("");
      onSaved();
      onMsg(`과목 "${name}" 추가됨`);
    } catch (e) {
      onMsg(apiErrorMessage(e, "과목 추가 실패"));
    }
  };
  const removeSubject = async (id: number, name: string) => {
    try {
      await removeSubjectM.mutateAsync(id);
      if (filterKey === "subjectIds" && picked.has(id)) setFilterValues(pickedIds.filter((v) => v !== id));
      onSaved();
      onMsg(`과목 "${name}" 삭제됨`);
    } catch (e) {
      onMsg(apiErrorMessage(e, "과목 삭제 실패 — 사용 중인 과목은 삭제할 수 없습니다"));
    }
  };

  return (
    <aside className="card w-full overflow-hidden" data-calendar-inspector>
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`h-9 flex-1 text-caption font-medium ${tab === t.key ? "border-b-2 border-accent text-fg" : "text-fg-muted"}`}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "resources" && (
        <div className="space-y-2 p-2">
          <div className="flex flex-wrap gap-1">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                className={`btn btn-sm h-7 px-2 ${kind === k ? "badge-accent" : ""}`}
                aria-pressed={kind === k}
                onClick={() => { setKind(k); setQ(""); }}
              >
                {RESOURCE_META[k].icon} {RESOURCE_META[k].label}
              </button>
            ))}
          </div>

          {kind === "session" ? (
            <div className="space-y-1 text-caption text-fg-muted">
              <p>현재 기간·필터 결과 <b className="text-fg">{listRows.length}건</b> — 정렬·그룹은 수업 탭에서.</p>
              <button type="button" className="btn btn-sm h-7" onClick={() => setTab("activities")}>수업 탭 열기 →</button>
            </div>
          ) : kind === "availability" ? (
            <>
              <input
                className="input h-7 w-full text-caption"
                placeholder="소유자 이름 검색"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="max-h-[300px] space-y-0.5 overflow-y-auto">
                {availabilityRows.map(({ block, ownerName }) => (
                  <div key={block.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-caption hover:bg-canvas-subtle">
                    <span className="min-w-0 flex-1 truncate">{ownerName}</span>
                    <span className="badge shrink-0 text-micro">{AVAILABILITY_KIND_LABEL[block.kind]}</span>
                    <span className="mono shrink-0 text-micro text-fg-subtle">{WD[block.weekday]} {block.startTime}–{block.endTime}</span>
                  </div>
                ))}
                {!availabilityRows.length && <EmptyState compact message="표시할 가용/불가 블록이 없습니다." />}
              </div>
              <p className="text-micro text-fg-subtle">편집은 캘린더 밴드(클릭·드래그·✕) 또는 스케줄 추가의 가용·불가 탭에서.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <input
                  className="input h-7 min-w-0 flex-1 text-caption"
                  placeholder={`${RESOURCE_META[kind].label} 검색`}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm h-7 w-7 shrink-0 p-0"
                  aria-label={sortDesc ? "이름 내림차순 (클릭하여 오름차순)" : "이름 오름차순 (클릭하여 내림차순)"}
                  onClick={() => setSortDesc((v) => !v)}
                >
                  {sortDesc ? "↓" : "↑"}
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-caption text-fg-muted">
                <span>{picked.size}/{kindRows.length} 필터</span>
                <button
                  type="button"
                  className="btn btn-sm ml-auto h-6 px-1.5 text-micro"
                  disabled={!filteredRows.length || filteredRows.every((r) => picked.has(r.id))}
                  onClick={() => setFilterValues([...new Set([...pickedIds, ...filteredRows.map((r) => r.id)])])}
                >
                  검색 결과 전체 선택
                </button>
                <button type="button" className="btn btn-sm h-6 px-1.5 text-micro" disabled={!picked.size} onClick={() => setFilterValues([])}>
                  전체 해제
                </button>
              </div>
              {kind === "subject" && canManage && (
                <div className="flex items-center gap-1.5">
                  <input
                    className="input h-7 min-w-0 flex-1 text-caption"
                    placeholder="새 과목 이름"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addSubject(); }}
                  />
                  <button type="button" className="btn btn-sm h-7 shrink-0" disabled={createSubjectM.isPending || !newSubject.trim()} onClick={() => void addSubject()}>
                    + 추가
                  </button>
                </div>
              )}
              <div className="max-h-[300px] space-y-0.5 overflow-y-auto">
                {filteredRows.map((r) => {
                  const inFilter = picked.has(r.id);
                  return (
                    <div key={r.id} className={`flex items-center gap-1 rounded ${inFilter ? "bg-neutral-subtle" : ""}`}>
                      <button
                        type="button"
                        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-1.5 text-left text-body hover:bg-canvas-subtle"
                        title={inFilter ? "클릭 = 필터에서 제외" : "클릭 = 이 항목으로 필터(캘린더 즉시 반영)"}
                        aria-pressed={inFilter}
                        onClick={() => setFilterValues(inFilter ? pickedIds.filter((v) => v !== r.id) : [...pickedIds, r.id])}
                      >
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? "var(--color-line)" }} />
                        <span className={`min-w-0 flex-1 truncate ${inFilter ? "font-semibold" : ""}`}>{r.name}</span>
                        {inFilter && <span className="shrink-0 text-caption font-bold text-accent" aria-label="필터 선택됨">✓</span>}
                        {r.sub && <span className="shrink-0 text-micro text-fg-subtle">{r.sub}</span>}
                      </button>
                      {r.resource && (
                        <button
                          type="button"
                          className={`btn btn-sm h-6 shrink-0 px-1.5 text-micro ${cardTarget?.type === r.resource.type && Number(cardTarget?.id) === r.id ? "badge-accent" : ""}`}
                          title="상세 카드 열기(상세 탭)"
                          onClick={() => { onSelectResource(r.resource!); setTab("detail"); }}
                        >
                          ⓘ
                        </button>
                      )}
                      {kind === "subject" && canManage && (
                        <button
                          type="button"
                          className="btn btn-sm h-6 shrink-0 px-1.5 text-micro text-danger"
                          title={`과목 "${r.name}" 삭제 — 사용 중이면 서버가 거부합니다`}
                          disabled={removeSubjectM.isPending}
                          onClick={() => void removeSubject(r.id, r.name)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                {!filteredRows.length && <EmptyState compact message="결과 없음" />}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "detail" && (
        <div ref={detailAnchorRef} className="space-y-2 p-2">
          <SessionDetailPanel
            row={detailRow}
            rooms={rooms}
            instructors={(resources?.instructors ?? []).map((i) => ({ id: Number(i.id), name: i.name }))}
            canEdit={canAdd}
            colorOf={colorOf}
            onPatch={onPatch}
            onDelete={onDelete}
            onOpenModal={onOpenModal}
            onPickStudent={(id, name) => {
              const res = resources?.students.find((x) => Number(x.id) === id);
              onSelectResource(res ?? ({ type: "student", id, name } as ScheduleResource));
            }}
            onPickInstructor={(id, name) => {
              const res = resources?.instructors.find((x) => Number(x.id) === id);
              onSelectResource(res ?? ({ type: "instructor", id, name } as ScheduleResource));
            }}
          />
          {detailRow && <ParticipantsCard row={detailRow} picked={cardTarget} onPick={(r) => onSelectResource(r)} />}
          {cardTarget && (
            <ResourceDetailCard
              selected={cardTarget}
              isFiltered={
                cardTarget.type === "instructor"
                  ? pane.filters.instructorIds.includes(Number(cardTarget.id))
                  : cardTarget.type === "student"
                    ? pane.filters.studentIds.includes(Number(cardTarget.id))
                    : pane.filters.roomIds.includes(Number(cardTarget.id))
              }
              onFocusView={() => {
                const filter = cardTarget.type === "instructor" ? "instructorIds" : cardTarget.type === "student" ? "studentIds" : "roomIds";
                dispatchPanes({ type: "pane/set-resource-filter", paneId: pane.id, filter, values: [Number(cardTarget.id)] });
              }}
              onClearFocus={() => {
                const filter = cardTarget.type === "instructor" ? "instructorIds" : cardTarget.type === "student" ? "studentIds" : "roomIds";
                dispatchPanes({ type: "pane/set-resource-filter", paneId: pane.id, filter, values: [] });
                onSelectResource(cardTarget);
              }}
              onMsg={onMsg}
              onSaved={onSaved}
              onAddSchedule={onAddScheduleFor ? () => onAddScheduleFor(cardTarget) : undefined}
            />
          )}
        </div>
      )}

      {tab === "activities" && (
        <div className="p-2">
          <SessionListPanel
            emptyHint={listEmptyHint}
            rows={listRows}
            groupBy={listGrouped ? listGroupDim : "none"}
            groupDim={listGroupDim}
            onToggleGroup={onToggleListGrouped}
            selectedId={detailRow?.id ?? null}
            onPick={onPickSession}
            colorOf={colorOf}
          />
        </div>
      )}

      {tab === "conflicts" && canManage && (
        <div className="space-y-2 p-2">
          {!detailRow ? (
            <EmptyState compact message="수업을 선택하면 현재 시간표 기준 충돌을 재검사합니다." />
          ) : conflictsQ.isLoading ? (
            <div className="p-2 text-caption text-fg-subtle">충돌 검사 중…</div>
          ) : conflictsQ.isError ? (
            <div className="p-2 text-caption text-danger">{apiErrorMessage(conflictsQ.error, "충돌 검사 실패")}</div>
          ) : (conflictsQ.data ?? []).length === 0 ? (
            <div className="rounded border border-line-muted p-2 text-caption text-fg-muted">
              ✅ 충돌 없음 — {detailRow.sessionDate} {detailRow.startTime} 기준(자기 자신 제외).
            </div>
          ) : (
            <ul className="space-y-1">
              {formatScheduleConflicts(conflictsQ.data ?? [], { rows: listRows, resources, rooms })
                .split("\n")
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="rounded border px-2 py-1 text-caption" style={{ borderColor: "var(--color-attention)", background: "color-mix(in srgb, var(--color-attention) 8%, transparent)" }}>
                    ⚠ {line.replace(/^·\s*/, "")}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {tab === "changes" && canManage && (
        <div className="max-h-[360px] space-y-2 overflow-y-auto p-2">
          {!detailRow ? (
            <EmptyState compact message="수업을 선택하면 변경 이력이 표시됩니다." />
          ) : (
            <ChangeHistory sessionId={detailRow.id} actorName={actorName} />
          )}
        </div>
      )}
    </aside>
  );
}
