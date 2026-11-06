export type Id = number | string;

export type StoryPlanDoc = {
  id: Id;
  story: Id;
  workflow: string;
  editor?: Id | { id: Id; name?: string } | null;
  deadline?: string | null;
  plannedPublication?: string | null;
  brief?: string | null;
  resources?: Array<{ id?: string; label: string; url: string; purpose?: string | null }> | null;
};

export type NamedDoc = { id: Id; name?: string; title?: string; label?: string };

export type WorkRecord = {
  id: Id;
  title?: string;
  label?: string;
  status?: string;
  state?: string;
  type?: string;
  kind?: string;
  due?: string | null;
  deadline?: string | null;
  scheduleMode?: string;
  startAt?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  assignees?: Array<Id | { id: Id; name?: string }>;
};
