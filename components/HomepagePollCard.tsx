"use client";

import { FormEvent, useState } from "react";
import { SiteIcon } from "./SiteIcon";

const pollOptions = ["More school news", "More sports coverage", "More student features"];

export function HomepagePollCard() {
  const [selected, setSelected] = useState(pollOptions[0]);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <aside className="homepage-poll-card" aria-labelledby="homepage-poll-heading">
      <div className="homepage-poll-heading">
        <SiteIcon name="ph:chart-bar-horizontal" width={18} height={18} />
        <h2 id="homepage-poll-heading">Your Opinion</h2>
      </div>
      <p>What should Weekly Wildcat cover more of next?</p>
      <form onSubmit={handleSubmit}>
        <div className="homepage-poll-options">
          {pollOptions.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="homepage-poll"
                value={option}
                checked={selected === option}
                onChange={() => {
                  setSelected(option);
                  setSubmitted(false);
                }}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <button type="submit">{submitted ? "Noted" : "Vote"}</button>
      </form>
    </aside>
  );
}
