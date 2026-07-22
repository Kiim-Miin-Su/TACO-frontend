import type { ScheduleResource } from '@/types';

/** 캘린더 전 화면에서 일정 담당자 이름을 같은 규칙으로 표시한다. */
export function scheduleResourceName(resource: Pick<ScheduleResource, 'name' | 'scheduleOwnerRole'>): string {
  return resource.scheduleOwnerRole === 'super_admin' ? `${resource.name} (대표)` : resource.name;
}
