import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@byline/newsroom-ui/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@byline/newsroom-ui/ui/avatar";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@byline/newsroom-ui/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@byline/newsroom-ui/ui/combobox";
import {
  TextAreaField,
  TextField,
  SelectField,
} from "@byline/newsroom-ui/components/form-fields";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@byline/newsroom-ui/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@byline/newsroom-ui/ui/item";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  ImagePlus,
  Plus,
  X,
} from "lucide-react";
import type { PeopleApi } from "./people-api";
import {
  PERSON_STATUSES,
  personInitials,
  type PersonDetail,
  type PersonProfile,
  type PersonSocial,
} from "./people-model";
import type { MediaPicker } from "../workspace/media-picker";
import {
  clonePerson,
  personErrors,
  personPatch,
  type PersonWork,
} from "./person-form";
import { PersonPreview } from "./PersonPreview";

const SERVICES = [
  "Website",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "X",
  "Bluesky",
  "YouTube",
];
const message = (error: unknown) =>
  typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : "Byline couldn't save this profile. Try again.";

/** The one explicit-save editor, used for both People and My profile. */
export function PersonEditor({
  api,
  detail,
  self = false,
  media,
  onBack,
  onNavigate,
  onSaved,
  onReload,
  onWorkChange,
  accessPanel,
  previewStyle,
}: {
  api: PeopleApi;
  detail: PersonDetail;
  self?: boolean;
  media: MediaPicker;
  onBack?: () => void;
  onNavigate: (href: string) => void;
  onSaved: (detail: PersonDetail) => void;
  onReload: () => void;
  onWorkChange: (work: PersonWork | null) => void;
  accessPanel?: ReactNode;
  previewStyle?: CSSProperties;
}) {
  const [saved, setSaved] = useState(detail);
  const [draft, setDraft] = useState(() => clonePerson(detail.person));
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [preview, setPreview] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const id = useId();
  const caps = saved.capabilities;
  const patch = personPatch(draft, saved.person, caps);
  const dirty = Object.keys(patch).length > 1;
  const errors = attempted ? personErrors(draft) : {};
  const update = <K extends keyof PersonProfile>(
    key: K,
    value: PersonProfile[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  };
  const discard = () => {
    setDraft(clonePerson(saved.person));
    setError("");
    setConflict(false);
    setAttempted(false);
    setNotice("");
  };
  useLayoutEffect(() => {
    onWorkChange({ dirty, saving: saving || picking, discard });
  });
  useLayoutEffect(() => () => onWorkChange(null), [onWorkChange]);
  useEffect(() => {
    setPhotoFailed(false);
  }, [draft.portrait?.url]);

  async function save() {
    if (busy.current || !dirty || !caps.editProfile) return;
    setAttempted(true);
    if (Object.keys(personErrors(draft)).length) return;
    busy.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await api.update(draft.id, patch);
      setSaved(next);
      setDraft(clonePerson(next.person));
      setConflict(false);
      setAttempted(false);
      setNotice("Profile saved in Byline.");
      onSaved(next);
    } catch (caught) {
      setError(message(caught));
      setConflict(
        (caught as { status?: number; data?: { status?: number } }).status ===
          409 ||
          (caught as { data?: { status?: number } }).data?.status === 409,
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function choosePhoto() {
    if (picking) return;
    setPicking(true);
    try {
      const assets = await media.pick("photo", {
        title: "Choose portrait",
        buttonLabel: "Use portrait",
        multiple: false,
      });
      const asset = assets[0];
      if (asset) {
        if (!asset.mimeType?.startsWith("image/")) {
          setError("Choose an image for the portrait.");
          return;
        }
        update("portrait", {
          id: asset.id,
          url: asset.previewUrl,
          unavailable: !asset.previewUrl,
        });
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPicking(false);
    }
  }
  function social(index: number, next: Partial<PersonSocial>) {
    update(
      "socials",
      draft.socials.map((entry, at) =>
        at === index ? { ...entry, ...next } : entry,
      ),
    );
  }
  function move(index: number, delta: number) {
    const next = [...draft.socials];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    update("socials", next);
  }

  return (
    <div className="space-y-8" data-person-editor="">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 pointer-coarse:min-h-11"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
          Back to People
        </Button>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-24 shrink-0" aria-hidden="true">
            {draft.portrait?.url ? (
              <AvatarImage
                src={draft.portrait.url}
                alt=""
                onError={() => setPhotoFailed(true)}
              />
            ) : null}
            <AvatarFallback className="text-xl">
              {personInitials(draft.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight">
              {self ? "My profile" : draft.name || "Unnamed person"}
            </h1>
            {self ? (
              <p className="text-sm text-muted-foreground">
                This is what readers see about you.
              </p>
            ) : draft.newsroomRole ? (
              <p className="break-words text-sm text-muted-foreground">
                {draft.newsroomRole}
              </p>
            ) : null}
            <Badge variant="secondary">{PERSON_STATUSES[draft.status]}</Badge>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Profile actions"
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreview(true)}
            className="pointer-coarse:min-h-11"
          >
            <Eye aria-hidden="true" />
            Preview
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={saving || picking}
              onClick={discard}
              className="pointer-coarse:min-h-11"
            >
              Cancel changes
            </Button>
          ) : null}
          <Button
            type="submit"
            form={`${id}-form`}
            disabled={!dirty || saving || picking || !caps.editProfile}
            className="pointer-coarse:min-h-11"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        Profiles saved here are part of the Payload migration. The public site
        still uses WordPress.
      </p>
      {error ? (
        <div className="space-y-2">
          <FieldError>{error}</FieldError>
          {conflict ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={onReload}>
                Reload newer profile
              </Button>
              <p className="text-sm text-muted-foreground">
                Keep this page open to copy your work before reloading.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="sr-only" role="status">
        {notice || (dirty ? "Unsaved profile changes" : "No unsaved changes")}
      </p>
      <form
        id={`${id}-form`}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }}
        className="grid min-w-0 gap-10 min-[1180px]:grid-cols-[minmax(0,1fr)_240px]"
      >
        <div className="min-w-0 space-y-8">
          <FieldSet disabled={saving || !caps.editProfile} className="min-w-0">
            <FieldLegend>Public profile</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel>Portrait</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void choosePhoto()}
                    disabled={picking || !media.available()}
                    className="pointer-coarse:min-h-11"
                  >
                    <ImagePlus aria-hidden="true" />
                    {draft.portrait ? "Change photo" : "Choose photo"}
                  </Button>
                  {draft.portrait ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => update("portrait", null)}
                      className="pointer-coarse:min-h-11"
                    >
                      Remove photo
                    </Button>
                  ) : null}
                </div>
                <FieldDescription>
                  Use a clear headshot. The circular preview above shows the
                  crop.
                </FieldDescription>
                {draft.portrait?.unavailable || photoFailed ? (
                  <p className="text-sm text-amber-800" role="status">
                    This portrait is unavailable. Choose another photo or remove
                    it.
                  </p>
                ) : null}
              </Field>
              <TextField
                label="Name"
                value={draft.name}
                onChange={(value) => update("name", value)}
                maxLength={120}
                hint="This name appears on bylines."
                error={errors.name}
              />
              {caps.editEditorialIdentity ? (
                <TextField
                  label="Newsroom role"
                  value={draft.newsroomRole}
                  onChange={(value) => update("newsroomRole", value)}
                  maxLength={80}
                  placeholder="Staff writer"
                />
              ) : (
                <Field>
                  <FieldLabel>Newsroom role</FieldLabel>
                  <p className="text-sm">{draft.newsroomRole || "Not set"}</p>
                  <FieldDescription>
                    Your newsroom role and profile visibility are managed by an
                    editor.
                  </FieldDescription>
                </Field>
              )}
              <TextField
                label="Pronouns"
                optional
                value={draft.pronouns}
                onChange={(value) => update("pronouns", value)}
                maxLength={40}
              />
              <TextAreaField
                label="Short bio"
                optional
                value={draft.shortBio}
                onChange={(value) => update("shortBio", value)}
                maxLength={400}
                rows={3}
                hint="One or two sentences shown with your byline/profile."
              />
              <TextAreaField
                label="Full bio"
                optional
                value={draft.bio}
                onChange={(value) => update("bio", value)}
                maxLength={4000}
                rows={7}
                hint="Shown in the About section of your author profile."
              />
            </FieldGroup>
          </FieldSet>
          <Separator />
          <FieldSet disabled={saving || !caps.editProfile} className="min-w-0">
            <FieldLegend>Contact &amp; links</FieldLegend>
            <FieldDescription>
              Only add contact details you want readers to see. Your sign-in
              email is never used here.
            </FieldDescription>
            <FieldGroup>
              <TextField
                label="Public email"
                optional
                type="email"
                value={draft.publicEmail}
                onChange={(value) => update("publicEmail", value)}
                error={errors.publicEmail}
              />
              {draft.socials.map((entry, index) => (
                <FieldSet
                  key={index}
                  className="min-w-0 gap-3"
                  data-person-social=""
                >
                  <FieldLegend variant="label">Link {index + 1}</FieldLegend>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <Field data-invalid={Boolean(errors[`label${index}`])}>
                      <FieldLabel htmlFor={`${id}-service-${index}`}>
                        Service or label
                      </FieldLabel>
                      <Combobox
                        items={SERVICES}
                        value={entry.label || null}
                        inputValue={entry.label}
                        onInputValueChange={(label) => social(index, { label })}
                        onValueChange={(label) => {
                          if (typeof label === "string")
                            social(index, { label });
                        }}
                      >
                        <ComboboxInput
                          id={`${id}-service-${index}`}
                          maxLength={40}
                          aria-invalid={Boolean(errors[`label${index}`])}
                          aria-describedby={
                            errors[`label${index}`]
                              ? `${id}-label-error-${index}`
                              : undefined
                          }
                        />
                        <ComboboxContent>
                          <ComboboxList>
                            {(label: string) => (
                              <ComboboxItem key={label} value={label}>
                                {label}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                      {errors[`label${index}`] ? (
                        <FieldError id={`${id}-label-error-${index}`}>
                          {errors[`label${index}`]}
                        </FieldError>
                      ) : null}
                    </Field>
                    <TextField
                      label="URL"
                      value={entry.url}
                      onChange={(url) => social(index, { url })}
                      placeholder="https://"
                      error={errors[`url${index}`]}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update(
                          "socials",
                          draft.socials.filter((_, at) => at !== index),
                        )
                      }
                      aria-label={`Remove ${
                        entry.label || `link ${index + 1}`
                      }`}
                      className="pointer-coarse:min-h-11"
                    >
                      <X aria-hidden="true" />
                      Remove
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${
                        entry.label || `link ${index + 1}`
                      } up`}
                      className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === draft.socials.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${
                        entry.label || `link ${index + 1}`
                      } down`}
                      className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </div>
                </FieldSet>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={draft.socials.length >= 8}
                  onClick={() =>
                    update("socials", [
                      ...draft.socials,
                      { label: "", url: "" },
                    ])
                  }
                  className="pointer-coarse:min-h-11"
                >
                  <Plus aria-hidden="true" />
                  Add link
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Up to eight HTTPS links, in the order shown on your profile.
                  Custom labels are welcome.
                </p>
              </div>
            </FieldGroup>
          </FieldSet>
        </div>
        <aside
          className="min-w-0 space-y-7"
          aria-label="Profile publication and account"
        >
          {caps.changeVisibility ? (
            <FieldSet disabled={saving}>
              <FieldLegend>Publication</FieldLegend>
              <FieldGroup>
                <SelectField
                  label="Status"
                  value={draft.status}
                  options={Object.entries(PERSON_STATUSES).map(
                    ([value, label]) => ({
                      value: value as PersonProfile["status"],
                      label,
                    }),
                  )}
                  onChange={(value) => update("status", value)}
                />
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${id}-directory`}
                    checked={draft.directoryVisible}
                    onCheckedChange={(checked) =>
                      update("directoryVisible", checked === true)
                    }
                  />
                  <FieldLabel htmlFor={`${id}-directory`}>
                    Show in staff directory
                  </FieldLabel>
                </Field>
                <FieldDescription>
                  A person can remain a valid byline without appearing in the
                  Staff directory.
                </FieldDescription>
                <Field orientation="horizontal">
                  <Checkbox
                    id={`${id}-profile`}
                    checked={draft.hasProfilePage}
                    onCheckedChange={(checked) =>
                      update("hasProfilePage", checked === true)
                    }
                  />
                  <FieldLabel htmlFor={`${id}-profile`}>
                    Has a public profile page
                  </FieldLabel>
                </Field>
                <FieldDescription>
                  A one-off guest can be credited without an /author/ page.
                  Changing status preserves these choices.
                </FieldDescription>
              </FieldGroup>
            </FieldSet>
          ) : (
            <section className="space-y-2">
              <h2 className="text-base font-medium">Publication</h2>
              <p className="text-sm text-muted-foreground">
                {draft.directoryVisible
                  ? "In staff directory"
                  : "Outside staff directory"}{" "}
                · {draft.hasProfilePage ? "Public profile page" : "Byline only"}
              </p>
            </section>
          )}
          {accessPanel ? (
            <>
              <Separator />
              {accessPanel}
            </>
          ) : null}
          {caps.editEditorialIdentity ? (
            <>
              <Separator />
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <Button type="button" variant="ghost" className="-ml-2" />
                  }
                >
                  <ChevronDown aria-hidden="true" />
                  Advanced
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <TextField
                    label="Slug"
                    value={draft.slug}
                    onChange={(value) => update("slug", value)}
                    disabled={saving}
                    hint="Changing this will change the future public author URL. Existing links will need redirects; this screen does not create them."
                  />
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {saved.usage.total === 1
              ? "Used on 1 accessible story"
              : `Used on ${saved.usage.total} accessible stories`}
            . Historical bylines stay when someone leaves the staff.
          </p>
        </aside>
      </form>
      <Separator />
      <section className="space-y-3" aria-labelledby={`${id}-stories`}>
        <h2 id={`${id}-stories`} className="text-base font-medium">
          Bylines{" "}
          <span className="font-normal text-muted-foreground">
            · {saved.usage.total} accessible{" "}
            {saved.usage.total === 1 ? "story" : "stories"}
          </span>
        </h2>
        {saved.usage.stories.length ? (
          <ItemGroup className="gap-1">
            {saved.usage.stories.map((story) => (
              <Item
                key={story.id}
                size="sm"
                className="flex-nowrap"
                render={
                  <a
                    href={story.href}
                    onClick={(event) => {
                      if (
                        event.button ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      onNavigate(story.href);
                    }}
                  />
                }
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">{story.title}</ItemTitle>
                  <ItemDescription>{story.state}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="size-4" aria-hidden="true" />
                  <span className="sr-only">Open story</span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <p className="text-sm text-muted-foreground">
            No stories you can access use this person yet.
          </p>
        )}
      </section>
      {preview ? (
        <PersonPreview
          draft={draft}
          onClose={() => setPreview(false)}
          style={previewStyle}
        />
      ) : null}
    </div>
  );
}
