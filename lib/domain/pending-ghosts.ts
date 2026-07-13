import type { AvailabilityBlock, AvailabilityOwner } from '@/types';
import type { AvailabilityKindEx, ScheduleRequestEx } from '@/lib/api';
import { toMin, weekdayOf } from './schedule';

export type CalendarOwnerRef = {
  type?: AvailabilityOwner | string | null;
  id?: number | string | null;
};

export type AvailabilityGhostBand = {
  id: number;
  requestKind: 'availability_upsert' | 'availability_delete';
  kind: AvailabilityKindEx;
  startMin: number;
  endMin: number;
  label: string;
  title: string;
  targetAvailabilityId?: number;
};

const KIND_LABEL: Record<AvailabilityKindEx, string> = {
  available: '가용시간',
  unavailable: '불가시간',
  online_only: '온라인만 가능',
};

function sameOwner(a: CalendarOwnerRef, b: CalendarOwnerRef): boolean {
  return !!a.type && !!b.type && a.type === b.type && a.id != null && b.id != null && Number(a.id) === Number(b.id);
}

function activeOnDate(date: string, weekday?: number, effectiveFrom?: string, effectiveTo?: string): boolean {
  return weekday === weekdayOf(date) && (!effectiveFrom || date >= effectiveFrom) && (!effectiveTo || date <= effectiveTo);
}

function blockOwner(block?: AvailabilityBlock | null): CalendarOwnerRef {
  return block ? { type: block.ownerType, id: block.ownerId } : {};
}

function requestOwner(r: ScheduleRequestEx): CalendarOwnerRef {
  return { type: r.availabilityOwnerType, id: r.availabilityOwnerId };
}

export function availabilityGhostBandsForColumn(input: {
  requests: ScheduleRequestEx[];
  blocks: AvailabilityBlock[];
  date: string;
  owner: CalendarOwnerRef;
}): AvailabilityGhostBand[] {
  if (!input.owner.type || input.owner.id == null) return [];
  const out: AvailabilityGhostBand[] = [];
  for (const r of input.requests) {
    if (r.status !== 'pending') continue;
    if (r.requestKind !== 'availability_upsert' && r.requestKind !== 'availability_delete') continue;
    const targetBlock = r.targetAvailabilityId != null
      ? input.blocks.find((b) => Number(b.id) === Number(r.targetAvailabilityId)) ?? null
      : null;

    if (r.requestKind === 'availability_delete') {
      const owner = sameOwner(blockOwner(targetBlock), input.owner) ? blockOwner(targetBlock) : requestOwner(r);
      const weekday = targetBlock?.weekday ?? r.availabilityWeekday;
      const startTime = targetBlock?.startTime ?? r.availabilityStartTime;
      const endTime = targetBlock?.endTime ?? r.availabilityEndTime;
      const kind = (targetBlock?.kind ?? r.availabilityKind ?? 'available') as AvailabilityKindEx;
      const effectiveFrom = targetBlock?.effectiveFrom ?? r.availabilityEffectiveFrom;
      const effectiveTo = targetBlock?.effectiveTo ?? r.availabilityEffectiveTo;
      if (!sameOwner(owner, input.owner) || !startTime || !endTime || !activeOnDate(input.date, weekday, effectiveFrom, effectiveTo)) continue;
      out.push({
        id: r.id,
        requestKind: r.requestKind,
        kind,
        startMin: toMin(startTime),
        endMin: toMin(endTime),
        label: `${KIND_LABEL[kind]} 삭제 대기`,
        title: `${KIND_LABEL[kind]} 삭제 승인 대기 · 요청 #${r.id}`,
        targetAvailabilityId: r.targetAvailabilityId,
      });
      continue;
    }

    const kind = (r.availabilityKind ?? 'available') as AvailabilityKindEx;
    if (
      !sameOwner(requestOwner(r), input.owner) ||
      !r.availabilityStartTime ||
      !r.availabilityEndTime ||
      !activeOnDate(input.date, r.availabilityWeekday, r.availabilityEffectiveFrom, r.availabilityEffectiveTo)
    ) {
      continue;
    }
    out.push({
      id: r.id,
      requestKind: r.requestKind,
      kind,
      startMin: toMin(r.availabilityStartTime),
      endMin: toMin(r.availabilityEndTime),
      label: `${KIND_LABEL[kind]} 변경 대기`,
      title: `${KIND_LABEL[kind]} 변경 승인 대기 · 요청 #${r.id}`,
      targetAvailabilityId: r.targetAvailabilityId,
    });
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.id - b.id);
}
