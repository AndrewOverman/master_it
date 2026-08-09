// Month names spelled out rather than going through Intl/toLocaleDateString:
// the app's copy is English-only, and this keeps output identical regardless
// of what ICU data a given Hermes build happens to ship with.
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MS_PER_DAY = 86_400_000;

export interface DueDateLabel {
  text: string;
  isOverdue: boolean;
  isToday: boolean;
}

// Midnight local, so comparisons are whole-day and never off-by-one because
// of the time of day the app happens to be open.
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Turns a plan step's `due_date` ('YYYY-MM-DD') into something worth reading.
 *
 * The raw ISO string told the user nothing at a glance and — more to the
 * point — never told them they were behind. `isOverdue` is what lets the UI
 * say so.
 *
 * `now` is injectable for tests.
 */
export function formatDueDate(isoDate: string, now: Date = new Date()): DueDateLabel {
  // Parsed as local (not `new Date('2026-08-14')`, which is treated as UTC and
  // can land on the previous day west of Greenwich).
  const due = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(due.getTime())) {
    return { text: isoDate, isOverdue: false, isToday: false };
  }

  const diffDays = Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / MS_PER_DAY);
  const dayMonth = `${MONTHS[due.getMonth()]} ${due.getDate()}`;
  const dateText = due.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth}, ${due.getFullYear()}`;

  if (diffDays === 0) return { text: 'Today', isOverdue: false, isToday: true };
  if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false, isToday: false };
  if (diffDays === -1) return { text: 'Yesterday', isOverdue: true, isToday: false };
  if (diffDays < 0) {
    return { text: `${dateText} · ${Math.abs(diffDays)} days ago`, isOverdue: true, isToday: false };
  }

  return { text: dateText, isOverdue: false, isToday: false };
}
