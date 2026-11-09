import { ARTICLE_BLOCK_LIMITS as LIMITS } from "./blocks";
import type { FinalScoreBlock, FinalScoreStatus } from "./types";

/**
 * Final Score is article content a reporter types: two teams, two scores and
 * how the game ended. It is deliberately not a sports record: there is no
 * team, game, season or schedule anywhere behind it. The winner is derived
 * from the scores every time and never stored.
 */

export const FINAL_SCORE_LABELS: Record<FinalScoreStatus, string> = { final: "Final", overtime: "Final · OT", tie: "Tie", forfeit: "Forfeit" };

/** A typed score as a whole number within bounds, or null when blank or not a score. */
export function scoreValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d{1,4}\s*$/.test(value) ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number >= 0 && number <= LIMITS.finalScoreMax ? number : null;
}

/** Which row won (`a` or `b`), or null for a tie, a forfeit without scores or incomplete scores. */
export function finalScoreWinner(block: Pick<FinalScoreBlock, "teamAScore" | "teamBScore" | "status">): "a" | "b" | null {
  const { teamAScore: a, teamBScore: b } = block;
  if (block.status === "tie" || a === null || b === null || a === b) return null;
  return a > b ? "a" : "b";
}

/** `YYYY-MM-DD` that is a real calendar day, or null. */
export function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

/** The first reason a result cannot publish, in the reporter's words, or null. */
export function finalScoreProblem(block: Pick<FinalScoreBlock, "teamA" | "teamB" | "teamAScore" | "teamBScore" | "status">): string | null {
  if (!block.teamA.trim() || !block.teamB.trim()) return "Name both teams.";
  const { teamAScore: a, teamBScore: b } = block;
  if (block.status === "forfeit") return (a === null) !== (b === null) ? "Give both scores, or neither for a forfeit." : null;
  if (a === null || b === null) return "Type both scores.";
  if (block.status === "tie" && a !== b) return "A tie needs equal scores. Choose Final if one team won.";
  if (block.status !== "tie" && a === b) return "The scores are equal. Choose Tie, or correct a score.";
  return null;
}

/** "Final score: Ninety Six 42, Abbeville 14." The whole result in one sentence for assistive technology. */
export function finalScoreSentence(block: Pick<FinalScoreBlock, "teamA" | "teamB" | "teamAScore" | "teamBScore" | "status" | "sport">): string {
  const row = (team: string, score: number | null) => (score === null ? team : `${team} ${score}`);
  const lead = block.status === "tie" ? "Tie" : block.status === "forfeit" ? "Forfeit" : block.status === "overtime" ? "Final score in overtime" : "Final score";
  const sport = block.sport ? ` (${block.sport})` : "";
  return `${lead}${sport}: ${row(block.teamA, block.teamAScore)}, ${row(block.teamB, block.teamBScore)}.`;
}

/** The kicker: FINAL, FINAL · OT, TIE or FORFEIT, then the sport. */
export function finalScoreKicker(block: Pick<FinalScoreBlock, "status" | "sport">): string {
  return [FINAL_SCORE_LABELS[block.status], block.sport?.trim()].filter(Boolean).join(" · ");
}

/** "Fri., Nov. 13, 2026" from a date-only value, never shifted by a timezone. */
export function formatCalendarDate(value: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
