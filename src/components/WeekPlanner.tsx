import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ArrowUpRight } from 'lucide-react';
import { Tag } from './ui';

/**
 * WeekPlanner - a small week calendar for real saved interview appointments.
 *
 * Behaviour
 * - One week window at a time with previous / next / "이번 주" navigation.
 * - Clicking a day selects it and lists that day's saved `interviewAt` values.
 * - Nothing is invented: only appointments passed in through `appointments`
 *   are shown, and each one links to its real application detail so the
 *   schedule can be edited there instead of in a fake meeting modal.
 * - The current day is highlighted; weeks are Sunday-first (Korean calendar).
 */
export interface WeekAppointment {
  /** Application id, used for the real edit route. */
  id: string;
  /** Raw saved `interviewAt` ISO string. */
  at: string;
  company: string;
  title: string;
  isDemo?: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function startOfWeek(base: Date): Date {
  const day = new Date(base);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

function addDays(base: Date, amount: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + amount);
  return next;
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '시간 미입력';
  return parsed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function WeekPlanner({ appointments }: { appointments: WeekAppointment[] }) {
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(() => startOfWeek(today));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(today));

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const todayKey = dateKey(today);

  const byDay = useMemo(() => {
    const map = new Map<string, WeekAppointment[]>();
    for (const appointment of appointments) {
      const parsed = new Date(appointment.at);
      if (!Number.isFinite(parsed.getTime())) continue;
      const key = dateKey(parsed);
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at));
    return map;
  }, [appointments]);

  const selected = byDay.get(selectedKey) ?? [];
  const weekLabel = `${anchor.getFullYear()}년 ${anchor.getMonth() + 1}월`;

  const shift = (weeks: number) => {
    const next = addDays(anchor, weeks * 7);
    setAnchor(next);
    setSelectedKey(dateKey(next));
  };

  const goToday = () => {
    setAnchor(startOfWeek(today));
    setSelectedKey(todayKey);
  };

  return (
    <section className="panel week-planner">
      <div className="week-planner-head">
        <div className="week-planner-title">
          <span className="week-planner-icon"><CalendarDays size={18} /></span>
          <div>
            <h2>이번 주 일정</h2>
            <span>저장한 면접 일정만 보여드려요</span>
          </div>
        </div>
        <div className="week-planner-nav">
          <button type="button" className="week-nav-button" aria-label="이전 주" onClick={() => shift(-1)}>
            <ChevronLeft size={17} />
          </button>
          <span className="week-planner-label" aria-live="polite">{weekLabel}</span>
          <button type="button" className="week-nav-button" aria-label="다음 주" onClick={() => shift(1)}>
            <ChevronRight size={17} />
          </button>
          <button type="button" className="week-today-button" onClick={goToday}>이번 주</button>
        </div>
      </div>

      <div className="week-grid" role="group" aria-label={`${weekLabel} 주간 일정`}>
        {days.map((day) => {
          const key = dateKey(day);
          const items = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <button
              type="button"
              key={key}
              className={`week-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${isWeekend ? 'is-weekend' : ''}`}
              aria-pressed={isSelected}
              aria-label={`${day.getMonth() + 1}월 ${day.getDate()}일 ${WEEKDAYS[day.getDay()]}요일${items.length ? `, 일정 ${items.length}건` : ''}`}
              onClick={() => setSelectedKey(key)}
            >
              <span className="week-day-name">{WEEKDAYS[day.getDay()]}</span>
              <span className="week-day-number">{day.getDate()}</span>
              <span className="week-day-dots" aria-hidden="true">
                {items.slice(0, 3).map((item) => <i key={item.id} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="week-day-list">
        <div className="week-day-list-head">
          <strong>{Number(selectedKey.slice(5, 7))}월 {Number(selectedKey.slice(8, 10))}일 일정</strong>
          <span>{selected.length ? `${selected.length}건` : '비어 있음'}</span>
        </div>
        {selected.length ? (
          <div className="week-appointments">
            {selected.map((item) => (
              <Link key={item.id} className="week-appointment" to={`/app/applications?application=${item.id}`}>
                <span className="week-appointment-time"><Clock3 size={14} />{formatTime(item.at)}</span>
                <div className="week-appointment-main">
                  <strong>{item.company}{item.isDemo ? <span className="demo-inline"> 가상 예시</span> : null}</strong>
                  <span>{item.title}</span>
                </div>
                <Tag tone="blue">일정 관리</Tag>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="week-day-empty">
            <CalendarDays size={19} />
            <p>이 날에는 저장한 면접 일정이 없어요.</p>
            <Link className="text-link" to="/app/applications">지원 현황에서 일정 추가하기<ArrowUpRight size={14} /></Link>
          </div>
        )}
      </div>
    </section>
  );
}
