import { Button, CheckboxControl, Notice, SelectControl, Spinner, TextControl } from "@wordpress/components";
import { useEffect, useMemo, useState } from "@wordpress/element";
import { arrowDown, arrowUp, trash } from "@wordpress/icons";
import type { ContributorEntry, GuestInput } from "./editorial-model";
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
  /** Shown only when the viewer may create guests; the server enforces the same rule. */
  canCreateGuest?: boolean;
  onCreateGuest?: (input: GuestInput) => Promise<ContributorEntry>;
  /** Opens the Media Library and resolves with the chosen image, or null if cancelled. */
  onChoosePhoto?: () => Promise<{ id: number; url: string } | null>;
};

/** Ordered user/guest bylines. The render path intentionally never displays email or internal notes. */
export function ContributorsPanel({
  contributors,
  availableContributors = [],
  canEdit,
  isLoading = false,
  isSaving = false,
  error,
  onChange,
  canCreateGuest = false,
  onCreateGuest,
  onChoosePhoto
}: ContributorsPanelProps) {
  const [draft, setDraft] = useState(() => orderContributors(contributors));
  const [selected, setSelected] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [guestFormOpen, setGuestFormOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestRole, setGuestRole] = useState("");
  const [guestPhoto, setGuestPhoto] = useState<{ id: number; url: string } | null>(null);
  const [guestHasPage, setGuestHasPage] = useState(false);
  const [guestCreating, setGuestCreating] = useState(false);
  const [guestNotice, setGuestNotice] = useState<string | null>(null);

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

  const resetGuestForm = () => {
    setGuestFormOpen(false);
    setGuestName("");
    setGuestRole("");
    setGuestPhoto(null);
    setGuestHasPage(false);
  };

  const choosePhoto = () => {
    if (!onChoosePhoto) return;
    void onChoosePhoto().then((photo) => {
      if (photo) setGuestPhoto(photo);
    });
  };

  const createGuest = async () => {
    const name = guestName.trim();
    if (!name || !onCreateGuest || guestCreating) return;
    setGuestCreating(true);
    setActionError(null);
    setGuestNotice(null);
    try {
      const guest = await onCreateGuest({
        name,
        ...(guestRole.trim() ? { role: guestRole.trim() } : {}),
        ...(guestPhoto ? { imageId: guestPhoto.id } : {}),
        hasProfilePage: guestHasPage
      });
      resetGuestForm();
      if (guest.status === "draft") {
        setGuestNotice(`${guest.name} was saved as a draft guest. A publisher needs to publish them before their name appears on the site.`);
      }
      persist([...draft, { ...guest, order: draft.length }]);
    } catch (caught) {
      setActionError(describeEditorialError(caught));
    } finally {
      setGuestCreating(false);
    }
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
        Removing the primary writer makes the first remaining WordPress writer the post author. With only guests or no writers, the WordPress owner stays internal.
      </p>

      {canEdit ? (
        <div className="byline-editorial-add-row">
          <SelectControl label="Add an author or guest" value={selected} options={options} disabled={isSaving} onChange={setSelected} />
          <Button variant="secondary" disabled={!selected || isSaving} onClick={addSelected}>Add contributor</Button>
        </div>
      ) : null}

      {canEdit && canCreateGuest && onCreateGuest ? (
        guestFormOpen ? (
          <div className="byline-editorial-guest-form">
            <strong>Add a new guest</strong>
            <p className="byline-editorial-muted">
              For a one-off contributor, such as a photographer who is not on staff. They are credited on this story and can be reused later.
            </p>
            <TextControl label="Name" value={guestName} onChange={setGuestName} disabled={guestCreating} />
            <TextControl
              label="Role (optional)"
              value={guestRole}
              onChange={setGuestRole}
              placeholder="Photographer"
              disabled={guestCreating}
            />
            <div className="byline-editorial-guest-photo">
              {guestPhoto ? <img src={guestPhoto.url} alt="" width={48} height={48} /> : null}
              <Button variant="secondary" onClick={choosePhoto} disabled={guestCreating || !onChoosePhoto}>
                {guestPhoto ? "Change photo" : "Choose photo"}
              </Button>
              {guestPhoto ? <Button variant="tertiary" onClick={() => setGuestPhoto(null)} disabled={guestCreating}>Remove photo</Button> : null}
            </div>
            <CheckboxControl
              label="Give them a profile page"
              help="Off by default. Without a page they appear by name and photo only, and are left out of the authors directory."
              checked={guestHasPage}
              onChange={setGuestHasPage}
              disabled={guestCreating}
            />
            <div className="byline-editorial-guest-actions">
              <Button variant="primary" onClick={() => void createGuest()} disabled={!guestName.trim() || guestCreating} isBusy={guestCreating}>
                Add guest to story
              </Button>
              <Button variant="tertiary" onClick={resetGuestForm} disabled={guestCreating}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="byline-editorial-guest-trigger">
            <Button variant="secondary" onClick={() => setGuestFormOpen(true)} disabled={isSaving}>Add a new guest</Button>
          </div>
        )
      ) : null}

      {guestNotice ? <Notice status="info" onRemove={() => setGuestNotice(null)}>{guestNotice}</Notice> : null}

      {draft.length === 0 ? (
        <p className="byline-editorial-empty-state">No additional contributors are attached to this story.</p>
      ) : (
        <ol className="byline-editorial-contributor-list" aria-label="Ordered contributors">
          {draft.map((contributor, index) => {
            const publicContributor = projectContributorPublic(contributor);
            return (
              <li key={contributorKey(contributor)} className="byline-editorial-contributor-row">
                <span className="byline-editorial-order" aria-hidden="true">{index + 1}</span>
                <div className="byline-editorial-contributor-identity">
                  {publicContributor.imageUrl ? (
                    <img className="byline-editorial-contributor-photo" src={publicContributor.imageUrl} alt="" width={32} height={32} />
                  ) : (
                    <span className="byline-editorial-contributor-photo byline-editorial-contributor-initial" aria-hidden="true">
                      {publicContributor.name.trim().slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="byline-editorial-contributor-copy">
                    <strong>{publicContributor.name}</strong>
                    <span>
                      {publicContributor.kind === "guest" ? "Guest contributor" : "WordPress user"}
                      {publicContributor.role ? ` · ${publicContributor.role}` : ""}
                      {contributor.kind === "guest" && contributor.hasProfilePage === false ? " · No profile page" : ""}
                      {contributor.kind === "guest" && contributor.status === "draft" ? " · Draft, not public yet" : ""}
                    </span>
                  </div>
                </div>
                {canEdit ? (
                  <div className="byline-editorial-contributor-actions">
                    <Button
                      icon={arrowUp}
                      size="small"
                      label={`Move ${publicContributor.name} up`}
                      disabled={index === 0 || isSaving}
                      onClick={() => persist(moveContributor(draft, index, "up"))}
                    />
                    <Button
                      icon={arrowDown}
                      size="small"
                      label={`Move ${publicContributor.name} down`}
                      disabled={index === draft.length - 1 || isSaving}
                      onClick={() => persist(moveContributor(draft, index, "down"))}
                    />
                    <Button
                      icon={trash}
                      size="small"
                      isDestructive
                      label={`Remove ${publicContributor.name}`}
                      disabled={isSaving}
                      onClick={() => remove(index)}
                    />
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
