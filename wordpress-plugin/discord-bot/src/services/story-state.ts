import type { Story } from '../wordpress/types.js';
export interface StoryDiff { title: boolean; status: boolean; card: boolean; publication: boolean }
export function storyDiff(previous: Story, current: Story): StoryDiff {
  return {
    title: previous.title !== current.title,
    status: previous.status !== current.status,
    card: ['title', 'status', 'deadline', 'section', 'visuals'].some((key) => previous[key as keyof Story] !== current[key as keyof Story]) || previous.writer?.id !== current.writer?.id || previous.editor?.id !== current.editor?.id,
    publication: previous.publicUrl !== current.publicUrl || previous.status !== current.status,
  };
}
export function validDeadline(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
