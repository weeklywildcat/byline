"use client";

type SportsSeasonOption = {
  href: string;
  label: string;
  year: string;
};

type SportsSeasonSelectorProps = {
  currentYear: string;
  seasons: SportsSeasonOption[];
};

export function SportsSeasonSelector({ currentYear, seasons }: SportsSeasonSelectorProps) {
  return (
    <label className="team-hub-selector">
      <span>Season</span>
      <select
        aria-label="Select a season"
        defaultValue={currentYear}
        onChange={(event) => {
          window.location.assign(event.currentTarget.selectedOptions[0].dataset.href || "/sports/");
        }}
      >
        {seasons.map((season) => (
          <option data-href={season.href} key={season.year} value={season.year}>
            {season.label}
          </option>
        ))}
      </select>
    </label>
  );
}
