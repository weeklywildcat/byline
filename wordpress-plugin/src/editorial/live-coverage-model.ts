/** GET/POST /byline/v1/editorial/stories/<id>/live and /live/updates. */
export type LiveStatus = '' | 'live' | 'ended';

export type LiveUpdateRecord = {
  id: number;
  title: string;
  text: string;
  date: string;
  pinned: boolean;
  imageId: number;
  author: string;
};

export type LiveCoverageRecord = {
  status: LiveStatus;
  startedAt: string;
  endedAt: string;
  updates: LiveUpdateRecord[];
};

export type LiveUpdateInput = { title: string; text: string; imageId: number; pinned: boolean };

export const EMPTY_LIVE_UPDATE: LiveUpdateInput = { title: '', text: '', imageId: 0, pinned: false };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function id(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function readLiveCoverage(value: unknown): LiveCoverageRecord {
  const raw = record(value);
  const status = raw.status === 'live' || raw.status === 'ended' ? raw.status : '';
  const updates = (Array.isArray(raw.updates) ? raw.updates : []).flatMap((entry): LiveUpdateRecord[] => {
    const item = record(entry);
    const updateId = id(item.id);
    return updateId ? [{
      id: updateId,
      title: text(item.title),
      text: text(item.text),
      date: text(item.date),
      pinned: item.pinned === true,
      imageId: id(item.imageId),
      author: text(item.author)
    }] : [];
  });
  return { status, startedAt: text(raw.startedAt), endedAt: text(raw.endedAt), updates };
}

export function canPostLiveUpdate(input: LiveUpdateInput) {
  return Boolean(input.title.trim() || input.text.trim() || input.imageId);
}

/** "4:12 PM" today, otherwise "Nov 2, 4:12 PM", in the editor's local time. */
export function liveUpdateTimeLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
