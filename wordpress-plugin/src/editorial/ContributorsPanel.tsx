import { Button, Notice, SelectControl, Spinner } from "@wordpress/components";
import { useEffect, useMemo, useState } from "@wordpress/element";
import type { ContributorEntry } from "./editorial-model";
import { contributorKey, describeEditorialError, moveContributor, orderContributors, projectContributorPublic } from "./editorial-model";
import "./editorial.css";

export type ContributorsPanelProps = {
  contributors: ContributorEntry[];
  availableContributors?: ContributorEntry[];
  canEdit: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: unknown;
  onChange: (contributors: ContributorEntry[]) => Promise<void> | void;
};

/** Ordered user/guest bylines. The render path intentionally never displays email or internal notes. */
export function ContributorsPanel({
  contributors,
  availableContributors = [],
  canEdit,
  isLoading = false,
  isSaving = false,
  error,
  onChange
}: ContributorsPanelProps) {
  const [draft, setDraft] = useState(() => orderContributors(contributors));
  const [selected, setSelected] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setDraft(orderContributors(contributors)), [contributors]);

  const existing = useMemo(() => new Set(draft.map(contributorKey)), [draft]);
  const options = [
    { label: "Choose a contributor…", value: "" },
    ...availableContributors
      .filter((candidate) => !existing.has(contributorKey(candidate)))
      .map((candidate) => ({
        label: `${candidate.name} (${candidate.kind === "guest" ? "guest" : "user"})`,
        value: contributorKey(candidate)
      }))
  ];

  const persist = (next: ContributorEntry[]) => {
    const ordered = orderContributors(next);
    setDraft(ordered);
    setActionError(null);
    void Promise.resolve(onChange(ordered)).catch((caught: unknown) => setActionError(describeEditorialError(caught)));
  };

  const addSelected = () => {
    const candidate = availableContributors.find((item) => contributorKey(item) === selected);
    if (!candidate) return;
    setSelected("");
    persist([...draft, { ...candidate, order: draft.length }]);
  };

  const remove = (index: number) => persist(draft.filter((_, candidateIndex) => candidateIndex !== index));

  return (
    <section className="byline-editorial-panel byline-editorial-contributors-panel" aria-labelledby="byline-editorial-contributors-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">Byline</span>
          <h2 id="byline-editorial-contributors-heading">Authors and contributors</h2>
        </div>
        {isLoading || isSaving ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)}</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}

      <p className="byline-editorial-muted">
        Keep the primary WordPress author first. Guest contributors can be ordered alongside users; private account details stay private.
      </p>

      {canEdit ? (
        <div className="byline-editorial-add-row">
          <SelectControl label="Add an author or guest" value={selected} options={options} disabled={isSaving} onChange={setSelected} />
          <Button variant="secondary" disabled={!selected || isSaving} onClick={addSelected}>Add contributor</Button>
        </div>
      ) : null}

      {draft.length === 0 ? (
        <p className="byline-editorial-empty-state">No additional contributors are attached to this story.</p>
      ) : (
        <ol className="byline-editorial-contributor-list" aria-label="Ordered contributors">
          {draft.map((contributor, index) => {
            const publicContributor = projectContributorPublic(contributor);
            return (
              <li key={contributorKey(contributor)} className="byline-editorial-contributor-row">
                <span className="byline-editorial-order" aria-hidden="true">{index + 1}</span>
                <div className="byline-editorial-contributor-copy">
                  <strong>{publicContributor.name}</strong>
                  <span>{publicContributor.kind === "guest" ? "Guest contributor" : "WordPress user"}{publicContributor.role ? ` · ${publicContributor.role}` : ""}</span>
                </div>
                {canEdit ? (
                  <div className="byline-editorial-inline-actions">
                    <Button
                      variant="tertiary"
                      disabled={index === 0 || isSaving}
                      onClick={() => persist(moveContributor(draft, index, "up"))}
                      aria-label={`Move ${publicContributor.name} up`}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="tertiary"
                      disabled={index === draft.length - 1 || isSaving}
                      onClick={() => persist(moveContributor(draft, index, "down"))}
                      aria-label={`Move ${publicContributor.name} down`}
                    >
                      Move down
                    </Button>
                    <Button variant="tertiary" isDestructive disabled={isSaving} onClick={() => remove(index)}>Remove</Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
