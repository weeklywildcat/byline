import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@byline/newsroom-ui/ui/alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@byline/newsroom-ui/ui/card";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@byline/newsroom-ui/ui/item";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  Eye,
  ImagePlus,
  Plus,
  Trash2,
} from "lucide-react";
import type { PeopleApi } from "./people-api";
import {
  PERSON_STATUSES,
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
import { PersonAvatar, inPlace } from "./PeoplePage";

const SERVICES = [
  "Website",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "X",
  "Bluesky",
  "YouTube",
];
const MAX_LINKS = 8;
const message = (error: unknown) =>
  typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : "Byline couldn't save this profile. Try again.";

/** A Card section with a real heading, as in the Story workspace. */
function Section({
  id,
  title,
  description,
  children,
  size,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm";
}) {
  return (
    <Card size={size} role="region" aria-labelledby={id} className="min-w-0">
      <CardHeader>
        <CardTitle id={id} role="heading" aria-level={2}>
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

/** The one explicit-save editor, used for both People and My profile. */
export function PersonEditor({
  api,
  detail,
  self = false,
  media,
  onBack,
  backHref,
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
  /** The People list address, for the breadcrumb's real link. */
  backHref?: string;
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
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const caps = saved.capabilities;
  const patch = personPatch(draft, saved.person, caps);
  const dirty = Object.keys(patch).length > 1;
  const errors = attempted ? personErrors(draft) : {};
  const locked = saving || !caps.editProfile;
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
    if (Object.keys(personErrors(draft)).length) {
      // Errors can be far below the toolbar's Save button: take the editor there.
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return;
    }
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
      toast.success("Profile saved");
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

  const subtitle = [draft.newsroomRole, draft.pronouns]
    .filter(Boolean)
    .join(" · ");
  const advanced = caps.editEditorialIdentity ? (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
          />
        }
      >
        <ChevronRight
          data-icon="inline-start"
          className="transition-transform in-aria-expanded:rotate-90"
          aria-hidden="true"
        />
        Advanced
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <TextField
          label="Slug"
          value={draft.slug}
          onChange={(value) => update("slug", value)}
          disabled={saving}
          hint="Sets the public /author/ address. Existing links need redirects; this screen doesn’t create them."
        />
      </CollapsibleContent>
    </Collapsible>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-6" data-person-editor="">
      <div
        className="sticky top-12 z-20 -mx-4 -mt-6 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 lg:-mx-6 lg:px-6"
        data-person-toolbar=""
      >
        {onBack ? (
          <Breadcrumb className="min-w-0 flex-[1_1_12rem]" aria-label="Profile breadcrumb">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink
                  href={backHref}
                  onClick={(event) => inPlace(event, onBack)}
                >
                  People
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {saved.person.name || "Unnamed person"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Your public profile
          </p>
        )}
        <div
          className="ml-auto flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Profile actions"
        >
          {dirty ? (
            <Badge
              variant="outline"
              className="hidden border-amber-300 bg-amber-50 text-amber-900 sm:inline-flex dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              Unsaved changes
            </Badge>
          ) : null}
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
            type="button"
            variant="outline"
            onClick={() => setPreview(true)}
            className="pointer-coarse:min-h-11"
          >
            <Eye data-icon="inline-start" aria-hidden="true" />
            Preview
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            disabled={!dirty || saving || picking || !caps.editProfile}
            className="min-w-16 pointer-coarse:min-h-11"
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <header className="flex min-w-0 items-center gap-4">
        <PersonAvatar
          person={draft}
          className="size-16 shrink-0 text-lg sm:size-20 sm:text-xl"
          onError={() => setPhotoFailed(true)}
        />
        <div className="grid min-w-0 gap-1.5">
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {self ? "My profile" : draft.name || "Unnamed person"}
          </h1>
          <p className="break-words text-sm text-muted-foreground">
            {self
              ? "This is what readers see about you."
              : subtitle || "No newsroom role"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{PERSON_STATUSES[draft.status]}</Badge>
            <Badge variant="outline" className="font-normal">
              {draft.directoryVisible
                ? "In staff directory"
                : "Not in staff directory"}
            </Badge>
            <Badge variant="outline" className="font-normal">
              {draft.hasProfilePage ? "Public profile page" : "Byline only"}
            </Badge>
          </div>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          {conflict ? <AlertTitle>{error}</AlertTitle> : null}
          <AlertDescription>
            {conflict
              ? "Your edits are still on this page. Copy anything you need, then reload."
              : error}
          </AlertDescription>
          {conflict ? (
            <AlertAction>
              <Button type="button" variant="outline" size="xs" onClick={onReload}>
                Reload newer profile
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}
      <p className="sr-only" role="status">
        {notice || (dirty ? "Unsaved profile changes" : "No unsaved changes")}
      </p>

      <form
        id={`${id}-form`}
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }}
        className="grid min-w-0 items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_20rem] [&_input]:scroll-mt-32 [&_textarea]:scroll-mt-32"
      >
        <div className="grid min-w-0 gap-6">
          <Section
            id={`${id}-public`}
            title="Public profile"
            description="Shown with bylines, on the Staff page and on the author page. Changes reach the website after the next publication build."
          >
            <FieldSet disabled={locked} className="min-w-0">
              <FieldLegend className="sr-only">Public profile</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldTitle id={`${id}-portrait`}>Portrait</FieldTitle>
                  <div
                    className="flex flex-wrap items-center gap-4"
                    role="group"
                    aria-labelledby={`${id}-portrait`}
                  >
                    <div className="grid gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void choosePhoto()}
                          disabled={picking || !media.available()}
                          className="pointer-coarse:min-h-11"
                        >
                          {picking ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <ImagePlus data-icon="inline-start" aria-hidden="true" />
                          )}
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
                        A clear, front-facing headshot. The circle at the top of
                        the page shows the crop.
                      </FieldDescription>
                    </div>
                  </div>
                  {draft.portrait?.unavailable || photoFailed ? (
                    <Alert role="status">
                      <CircleAlert aria-hidden="true" />
                      <AlertDescription>
                        This portrait is unavailable. Choose another photo or
                        remove it.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </Field>
                <FieldSeparator />
                <div className="grid min-w-0 gap-x-4 gap-y-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <TextField
                    label="Name"
                    value={draft.name}
                    onChange={(value) => update("name", value)}
                    maxLength={120}
                    hint="As it appears on bylines."
                    error={errors.name}
                  />
                  <TextField
                    label="Pronouns"
                    optional
                    value={draft.pronouns}
                    onChange={(value) => update("pronouns", value)}
                    maxLength={40}
                    placeholder="she/her"
                  />
                </div>
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
                    <FieldTitle>Newsroom role</FieldTitle>
                    <p className="text-sm">
                      {draft.newsroomRole || "Not set"}
                    </p>
                    <FieldDescription>
                      Your newsroom role and profile visibility are managed by
                      an editor.
                    </FieldDescription>
                  </Field>
                )}
                <TextAreaField
                  label="Short bio"
                  optional
                  value={draft.shortBio}
                  onChange={(value) => update("shortBio", value)}
                  maxLength={400}
                  rows={3}
                  hint="One or two sentences shown with bylines and on the Staff page."
                />
                <TextAreaField
                  label="Full bio"
                  optional
                  value={draft.bio}
                  onChange={(value) => update("bio", value)}
                  maxLength={4000}
                  rows={7}
                  hint="The About section of the author page."
                />
              </FieldGroup>
            </FieldSet>
          </Section>

          <Section
            id={`${id}-contact`}
            title="Contact & links"
            description="Only what readers should see. The sign-in email is never used here."
          >
            <FieldSet disabled={locked} className="min-w-0">
              <FieldLegend className="sr-only">Contact &amp; links</FieldLegend>
              <FieldGroup>
                <TextField
                  label="Public email"
                  optional
                  type="email"
                  value={draft.publicEmail}
                  onChange={(value) => update("publicEmail", value)}
                  error={errors.publicEmail}
                  placeholder="name@example.com"
                />
                <FieldSet className="min-w-0 gap-3">
                  <FieldLegend variant="label">Links</FieldLegend>
                  <FieldDescription>
                    Up to eight HTTPS links, in the order they appear on the
                    profile. Pick a service or type your own label.
                  </FieldDescription>
                  {draft.socials.length ? (
                    <div className="grid min-w-0 gap-2">
                      <div
                        className="hidden grid-cols-[10rem_minmax(0,1fr)_6.5rem] gap-2 text-xs font-medium text-muted-foreground sm:grid"
                        aria-hidden="true"
                      >
                        <span>Service or label</span>
                        <span>URL</span>
                      </div>
                      <ol className="grid min-w-0 gap-3 sm:gap-2">
                        {draft.socials.map((entry, index) => {
                          const name = entry.label || `link ${index + 1}`;
                          const labelError = errors[`label${index}`];
                          const urlError = errors[`url${index}`];
                          return (
                            <li
                              key={index}
                              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_6.5rem]"
                              data-person-social=""
                            >
                              <Field
                                data-invalid={Boolean(labelError)}
                                className="col-span-2 sm:col-span-1"
                              >
                                <FieldLabel
                                  htmlFor={`${id}-service-${index}`}
                                  className="sr-only"
                                >
                                  Service or label
                                </FieldLabel>
                                <Combobox
                                  items={SERVICES}
                                  value={entry.label || null}
                                  inputValue={entry.label}
                                  onInputValueChange={(label) =>
                                    social(index, { label })
                                  }
                                  onValueChange={(label) => {
                                    if (typeof label === "string")
                                      social(index, { label });
                                  }}
                                >
                                  <ComboboxInput
                                    id={`${id}-service-${index}`}
                                    maxLength={40}
                                    placeholder="Service"
                                    className="w-full"
                                    disabled={locked}
                                    aria-invalid={Boolean(labelError)}
                                    aria-describedby={
                                      labelError
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
                                {labelError ? (
                                  <FieldError id={`${id}-label-error-${index}`}>
                                    {labelError}
                                  </FieldError>
                                ) : null}
                              </Field>
                              <Field data-invalid={Boolean(urlError)}>
                                <FieldLabel
                                  htmlFor={`${id}-url-${index}`}
                                  className="sr-only"
                                >
                                  URL
                                </FieldLabel>
                                <Input
                                  id={`${id}-url-${index}`}
                                  type="url"
                                  inputMode="url"
                                  value={entry.url}
                                  onChange={(event) =>
                                    social(index, { url: event.target.value })
                                  }
                                  placeholder="https://"
                                  aria-invalid={Boolean(urlError)}
                                  aria-describedby={
                                    urlError
                                      ? `${id}-url-error-${index}`
                                      : undefined
                                  }
                                />
                                {urlError ? (
                                  <FieldError id={`${id}-url-error-${index}`}>
                                    {urlError}
                                  </FieldError>
                                ) : null}
                              </Field>
                              <ButtonGroup aria-label={`Arrange ${name}`}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  disabled={index === 0}
                                  onClick={() => move(index, -1)}
                                  aria-label={`Move ${name} up`}
                                  className="pointer-coarse:size-11"
                                >
                                  <ArrowUp aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  disabled={index === draft.socials.length - 1}
                                  onClick={() => move(index, 1)}
                                  aria-label={`Move ${name} down`}
                                  className="pointer-coarse:size-11"
                                >
                                  <ArrowDown aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() =>
                                    update(
                                      "socials",
                                      draft.socials.filter(
                                        (_, at) => at !== index,
                                      ),
                                    )
                                  }
                                  aria-label={`Remove ${name}`}
                                  className="text-muted-foreground hover:text-destructive pointer-coarse:size-11"
                                >
                                  <Trash2 aria-hidden="true" />
                                </Button>
                              </ButtonGroup>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : null}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={draft.socials.length >= MAX_LINKS}
                      onClick={() =>
                        update("socials", [
                          ...draft.socials,
                          { label: "", url: "" },
                        ])
                      }
                      className="pointer-coarse:min-h-11"
                    >
                      <Plus data-icon="inline-start" aria-hidden="true" />
                      Add link
                    </Button>
                  </div>
                </FieldSet>
              </FieldGroup>
            </FieldSet>
          </Section>
        </div>

        <aside
          className="grid min-w-0 gap-6"
          aria-label="Profile publication and account"
        >
          <Section
            id={`${id}-publication`}
            title="Publication"
            size="sm"
            description="Where this person appears on the website."
          >
            {caps.changeVisibility ? (
              <FieldSet disabled={saving} className="min-w-0">
                <FieldLegend className="sr-only">Publication</FieldLegend>
                <FieldGroup className="gap-5">
                  <SelectField
                    label="Status"
                    value={draft.status}
                    disabled={saving}
                    options={Object.entries(PERSON_STATUSES).map(
                      ([value, label]) => ({
                        value: value as PersonProfile["status"],
                        label,
                      }),
                    )}
                    onChange={(value) => update("status", value)}
                    hint="Changing status keeps the choices below."
                  />
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-directory`}>
                        Show in staff directory
                      </FieldLabel>
                      <FieldDescription id={`${id}-directory-help`}>
                        Listed on the Staff page. Bylines work either way.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id={`${id}-directory`}
                      checked={draft.directoryVisible}
                      disabled={saving}
                      aria-describedby={`${id}-directory-help`}
                      onCheckedChange={(checked) =>
                        update("directoryVisible", checked === true)
                      }
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-profile`}>
                        Has a public profile page
                      </FieldLabel>
                      <FieldDescription id={`${id}-profile-help`}>
                        An /author/ page. Off credits them byline-only.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id={`${id}-profile`}
                      checked={draft.hasProfilePage}
                      disabled={saving}
                      aria-describedby={`${id}-profile-help`}
                      onCheckedChange={(checked) =>
                        update("hasProfilePage", checked === true)
                      }
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>
            ) : (
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Staff directory</dt>
                  <dd>{draft.directoryVisible ? "Listed" : "Not listed"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Profile page</dt>
                  <dd>{draft.hasProfilePage ? "Yes" : "Byline only"}</dd>
                </div>
              </dl>
            )}
            {advanced ? (
              <>
                <FieldSeparator className="my-3" />
                {advanced}
              </>
            ) : null}
          </Section>
          {accessPanel}
          <Section
            id={`${id}-stories`}
            title="Bylines"
            size="sm"
            description={`${saved.usage.total} accessible ${
              saved.usage.total === 1 ? "story" : "stories"
            }. Bylines stay when someone leaves the staff.`}
          >
            {saved.usage.stories.length ? (
              <ItemGroup className="-mx-2 gap-0.5">
                {saved.usage.stories.map((story) => (
                  <div role="listitem" key={story.id}>
                    <Item
                      size="xs"
                      className="flex-nowrap px-2"
                      render={
                        <a
                          href={story.href}
                          onClick={(event) =>
                            inPlace(event, () => onNavigate(story.href))
                          }
                        />
                      }
                    >
                      <ItemContent className="min-w-0">
                        <ItemTitle className="block max-w-full truncate">
                          {story.title}
                        </ItemTitle>
                        <ItemDescription>{story.state}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <ChevronRight
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Open story</span>
                      </ItemActions>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                No stories you can access credit this person yet.
              </p>
            )}
          </Section>
        </aside>
      </form>
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
