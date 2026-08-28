// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollWidget } from "@/components/PollWidget";
import { MIN_RESULTS_VOTES, type ActivePoll } from "@/lib/polls";
import { getPollVotedCookieName } from "@/lib/voter-cookie";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const POLL_ID = "website-coverage";

function poll(overrides: Partial<ActivePoll> = {}): ActivePoll {
  return {
    id: POLL_ID,
    question: "What should we cover more of next?",
    options: [
      { id: "news", label: "More school news", votes: 0 },
      { id: "sports", label: "More sports coverage", votes: 0 }
    ],
    totalVotes: 0,
    resultsAvailable: false,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  document.cookie = `${getPollVotedCookieName(POLL_ID)}=; Max-Age=0; Path=/`;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  await act(async () => {
    root.render(<PollWidget />);
  });
}

function text() {
  return container.textContent ?? "";
}

function radios() {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

async function submit() {
  const form = container.querySelector("form");
  await act(async () => {
    form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("PollWidget", () => {
  it("shows a loading state before the poll resolves", async () => {
    let release: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => {
      release = resolve;
    }));

    await act(async () => {
      root.render(<PollWidget />);
    });

    expect(container.querySelector(".homepage-poll-loading")).not.toBeNull();

    await act(async () => {
      release(jsonResponse(poll()));
    });

    expect(container.querySelector(".homepage-poll-loading")).toBeNull();
  });

  it("uses a server-rendered block payload without fetching a second poll", async () => {
    await act(async () => {
      root.render(<PollWidget initialPoll={poll({ votingOpen: true })} heading="Reader question" />);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain("Reader question");
    expect(text()).toContain("What should we cover more of next?");
    expect(container.querySelector("form")).not.toBeNull();
  });

  it("renders the active poll question and answers", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    expect(fetchMock).toHaveBeenCalledWith("/api/polls/active", expect.objectContaining({ cache: "no-store" }));
    expect(text()).toContain("What should we cover more of next?");
    expect(text()).toContain("More school news");
    expect(radios()).toHaveLength(2);
    expect(radios()[0].checked).toBe(true);
    expect(container.querySelector("button[type=submit]")?.textContent).toBe("Vote");
  });

  it("reports when no poll is open", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "No active poll is available." }, 404));
    await render();

    expect(text()).toContain("No poll is open right now.");
    expect(container.querySelector("form")).toBeNull();
  });

  it("reports an unavailable poll API without offering a vote", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Poll service is unavailable." }, 502));
    await render();

    expect(text()).toContain("Poll results are unavailable right now.");
    expect(container.querySelector("form")).toBeNull();
  });

  it("recovers from a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await render();

    expect(text()).toContain("Poll results are unavailable right now.");
  });

  it("lets a reader choose a different answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    await act(async () => {
      radios()[1].click();
    });

    expect(radios()[1].checked).toBe(true);
    expect(radios()[0].checked).toBe(false);
  });

  it("submits the selected answer and shows results once enough people have voted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    await act(async () => {
      radios()[1].click();
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        poll({
          totalVotes: 8,
          resultsAvailable: true,
          options: [
            { id: "news", label: "More school news", votes: 6 },
            { id: "sports", label: "More sports coverage", votes: 2 }
          ]
        })
      )
    );
    await submit();

    const [, request] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toBe("/api/polls/vote");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual({ pollId: POLL_ID, optionId: "sports" });

    expect(text()).toContain("Vote counted.");
    expect(text()).toContain("75%");
    expect(text()).toContain("25%");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector(".homepage-poll-bar-fill-leading")).not.toBeNull();
  });

  it("thanks a reader without showing results below the response threshold", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    // What the API actually sends while suppressing: every count withheld,
    // including the running total.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        poll({
          totalVotes: 0,
          resultsAvailable: false,
          options: [
            { id: "news", label: "More school news", votes: 0 },
            { id: "sports", label: "More sports coverage", votes: 0 }
          ]
        })
      )
    );
    await submit();

    expect(text()).toContain("Thanks for your response.");
    expect(text()).not.toContain("%");
    expect(container.querySelector(".homepage-poll-results")).toBeNull();
  });

  it("treats resultsAvailable as authoritative rather than counting votes itself", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    // The server released results at a total the client would not have accepted
    // on its own. The flag decides, not the arithmetic.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        poll({
          totalVotes: 2,
          resultsAvailable: true,
          options: [
            { id: "news", label: "More school news", votes: 1 },
            { id: "sports", label: "More sports coverage", votes: 1 }
          ]
        })
      )
    );
    await submit();

    expect(container.querySelector(".homepage-poll-results")).not.toBeNull();
    expect(text()).toContain("50%");
  });

  it("falls back to the threshold only when the API omits the flag", async () => {
    const legacy = poll({
      totalVotes: 9,
      options: [
        { id: "news", label: "More school news", votes: 6 },
        { id: "sports", label: "More sports coverage", votes: 3 }
      ]
    });
    delete legacy.resultsAvailable;

    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    fetchMock.mockResolvedValueOnce(jsonResponse(legacy));
    await submit();

    expect(text()).toContain("67%");
    expect(MIN_RESULTS_VOTES).toBe(5);
  });

  it("never shows percentages the API withheld, even at a high total", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    // A suppressed payload reports a real total with zeroed per-answer counts.
    fetchMock.mockResolvedValueOnce(jsonResponse(poll({ totalVotes: 40, resultsAvailable: false })));
    await submit();

    expect(text()).toContain("Thanks for your response.");
    expect(container.querySelector(".homepage-poll-results")).toBeNull();
  });

  it("explains a duplicate vote and shows where things stand", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Already voted.",
          poll: poll({
            totalVotes: 10,
            resultsAvailable: true,
            options: [
              { id: "news", label: "More school news", votes: 5 },
              { id: "sports", label: "More sports coverage", votes: 5 }
            ]
          })
        },
        409
      )
    );
    await submit();

    expect(text()).toContain("You already voted. Here is where things stand.");
    expect(text()).toContain("50%");
  });

  it("stays quiet about a duplicate vote while results are still suppressed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Already voted.", poll: poll({ totalVotes: 0, resultsAvailable: false }) }, 409)
    );
    await submit();

    expect(text()).toContain("Thanks for your response.");
    expect(text()).not.toContain("You already voted");
  });

  it("reports a rejected vote", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(poll()));
    await render();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Poll is not open." }, 404));
    await submit();

    expect(text()).toContain("We could not record that vote right now.");
  });

  it("skips straight to results when this browser already voted", async () => {
    document.cookie = `${getPollVotedCookieName(POLL_ID)}=true; Path=/`;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        poll({
          totalVotes: 12,
          resultsAvailable: true,
          options: [
            { id: "news", label: "More school news", votes: 9 },
            { id: "sports", label: "More sports coverage", votes: 3 }
          ]
        })
      )
    );
    await render();

    expect(container.querySelector("form")).toBeNull();
    expect(text()).toContain("75%");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
