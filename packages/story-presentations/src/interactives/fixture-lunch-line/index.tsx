import type { RepositoryInteractive } from "../types";

/**
 * The fixture interactive. Its static fallback is a small table that already
 * says everything the calculator would; `client.ts` adds a slider that
 * recomputes the longest wait. Fixture only: see `fixtureRepositoryInteractives`.
 */
export function FixtureLunchLine({ title }: { title: string; description: string }) {
  return (
    <div className="fixture-lunch-line" data-fixture-interactive="lunch-line">
      <table>
        <caption>{title}: waits at 30 minutes per period</caption>
        <thead>
          <tr><th scope="col">Period</th><th scope="col">Longest wait (minutes)</th></tr>
        </thead>
        <tbody>
          <tr><th scope="row">First lunch</th><td data-wait="first">8</td></tr>
          <tr><th scope="row">Second lunch</th><td data-wait="second">14</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export const FIXTURE_LUNCH_LINE: RepositoryInteractive = {
  key: "fixture-lunch-line",
  name: "Lunch line calculator (fixture)",
  description: "Shows how the length of a lunch period changes the longest wait.",
  Fallback: FixtureLunchLine,
  client: true
};
