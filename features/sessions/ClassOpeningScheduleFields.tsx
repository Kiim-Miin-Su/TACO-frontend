'use client';

import type { Room } from '@/types';
import { Combobox, Field } from '@/components/ui';
import { ColorPicker } from '@/features/calendar/SessionEditFields';
import { ScheduleDateField } from '@/features/calendar/inputs/ScheduleDateField';
import { ScheduleRepeatFields, type ScheduleRepeat } from '@/features/calendar/inputs/ScheduleRepeatFields';
import { ScheduleTimeRangeFields } from '@/features/calendar/inputs/ScheduleTimeRangeFields';

type ClassOpeningScheduleFieldsProps = {
  rooms: Room[];
  date: string;
  startTime: string;
  endTime: string;
  roomId: number | null;
  mode: 'in_person' | 'online';
  color?: string;
  topic: string;
  memo: string;
  topicSuggestions: string[];
  repeat: ScheduleRepeat;
  customWeekdays: number[];
  untilDate: string;
  occurrencesCount: number;
  onDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onRoomChange: (value: number | null) => void;
  onModeChange: (value: 'in_person' | 'online') => void;
  onColorChange: (value: string) => void;
  onTopicChange: (value: string) => void;
  onMemoChange: (value: string) => void;
  onRepeatChange: (value: ScheduleRepeat) => void;
  onToggleWeekday: (weekday: number) => void;
  onUntilDateChange: (value: string) => void;
};

/** 실제 class_session/series에 저장되는 날짜·시간·장소·표시 입력 묶음. */
export function ClassOpeningScheduleFields({
  rooms,
  date,
  startTime,
  endTime,
  roomId,
  mode,
  color,
  topic,
  memo,
  topicSuggestions,
  repeat,
  customWeekdays,
  untilDate,
  occurrencesCount,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onRoomChange,
  onModeChange,
  onColorChange,
  onTopicChange,
  onMemoChange,
  onRepeatChange,
  onToggleWeekday,
  onUntilDateChange,
}: ClassOpeningScheduleFieldsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScheduleDateField label="첫 수업일 *" value={date} onChange={onDateChange} />
        <ScheduleRepeatFields
          repeat={repeat}
          onRepeatChange={onRepeatChange}
          customWeekdays={customWeekdays}
          onToggleWeekday={onToggleWeekday}
          untilDate={untilDate}
          onUntilDateChange={onUntilDateChange}
          startDate={date}
          occurrencesCount={occurrencesCount}
          noneLabel="한 번만"
        />
      </div>

      <ScheduleTimeRangeFields
        start={startTime}
        end={endTime}
        onStartChange={onStartTimeChange}
        onEndChange={onEndTimeChange}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="수업 방식 *">
          <select className="input" value={mode} onChange={(event) => onModeChange(event.target.value as 'in_person' | 'online')}>
            <option value="in_person">대면</option>
            <option value="online">온라인</option>
          </select>
        </Field>
        <Field label="강의실">
          <select className="input" value={roomId ?? ''} onChange={(event) => onRoomChange(event.target.value ? Number(event.target.value) : null)}>
            <option value="">미지정</option>
            {rooms.filter((room) => room.isActive).map((room) => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="수업 주제">
        <Combobox
          value={topic}
          onChange={onTopicChange}
          suggestions={topicSuggestions}
          suggestionLabel="최근 사용 주제"
          createLabel="주제로 입력"
          placeholder="예: Vocab #6 문장 만들기"
        />
      </Field>

      <Field label="운영 메모">
        <textarea
          className="input min-h-20 py-2 resize-y"
          maxLength={500}
          value={memo}
          onChange={(event) => onMemoChange(event.target.value)}
          placeholder="교재, 준비물, 특이사항"
        />
      </Field>

      <Field label="캘린더 색상">
        <ColorPicker value={color} onChange={onColorChange} />
      </Field>
    </div>
  );
}
