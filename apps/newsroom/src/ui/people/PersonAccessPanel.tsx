"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import {
  PERSON_ACCESS_ROLES,
  type PersonAccessInput,
  type PersonAccessRole,
  type PersonDetail,
} from "@byline/newsroom-screens/people/people-model";
import type { PeopleApi } from "@byline/newsroom-screens/people/people-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@byline/newsroom-ui/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@byline/newsroom-ui/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@byline/newsroom-ui/ui/select";
import { KeyRound, ShieldCheck } from "lucide-react";

type AccessDraft = {
  email: string;
  role: PersonAccessRole;
  password: string;
};

const message = (error: unknown) =>
  typeof (error as { message?: unknown })?.message === "string"
    ? (error as { message: string }).message
    : "Byline couldn't change newsroom access. Try again.";

export function PersonAccessPanel({
  api,
  detail,
  onSaved,
}: {
  api: PeopleApi;
  detail: PersonDetail;
  onSaved: (detail: PersonDetail) => void;
}) {
  const access = detail.access;
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [draft, setDraft] = useState<AccessDraft>({
    email: access?.email ?? "",
    role: access?.role ?? "staff",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const beginEdit = () => {
    setError("");
    setDraft({
      email: access?.email ?? "",
      role: access?.role ?? "staff",
      password: "",
    });
    setEditing(true);
  };

  const save = async () => {
    if (busy) return;
    const email = draft.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Use a valid sign-in email.");
      return;
    }
    if (draft.password && (draft.password.length < 12 || draft.password.length > 128)) {
      setError("Use a local password of 12 to 128 characters, or leave it blank.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api.saveAccess(detail.person.id, {
        email,
        role: draft.role,
        enabled: access?.enabled ?? true,
        password: draft.password || undefined,
        expectedRevision: access?.revision ?? null,
      });
      onSaved(next);
      setEditing(false);
      toast.success(access ? "Newsroom access updated." : "Newsroom access granted.");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!access || busy) return;
    setBusy(true);
    setError("");
    try {
      const input: PersonAccessInput = {
        email: access.email,
        role: access.role,
        enabled,
        expectedRevision: access.revision,
      };
      const next = await api.saveAccess(detail.person.id, input);
      onSaved(next);
      setConfirmDisable(false);
      toast.success(enabled ? "Byline access enabled." : "Byline access disabled.");
    } catch (caught) {
      setError(message(caught));
      setConfirmDisable(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={id + "-access"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id + "-access"} className="text-base font-medium">
          Newsroom access
        </h2>
        <Badge variant={access?.enabled ? "outline" : "secondary"}>
          {!access ? "No access" : access.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Controls sign-in to Byline. Public profiles, bylines and story history stay separate.
      </p>

      {access ? (
        <Item size="sm" variant="muted" className="items-start">
          <ItemContent className="min-w-0">
            <ItemTitle className="break-all">{access.email}</ItemTitle>
            <ItemDescription className="line-clamp-none">
              {PERSON_ACCESS_ROLES[access.role]} · {access.googleConnected ? "Google connected" : "Google not connected"}
            </ItemDescription>
          </ItemContent>
        </Item>
      ) : (
        <div className="rounded-lg border border-dashed p-3">
          <div className="flex items-start gap-2">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              This Person can be credited on stories but cannot sign in to the newsroom.
            </p>
          </div>
        </div>
      )}

      {error && !editing ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={beginEdit} disabled={busy}>
          {access ? "Access settings" : "Give newsroom access"}
        </Button>
        {access?.enabled ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDisable(true)} disabled={busy}>
            Disable access
          </Button>
        ) : access ? (
          <Button type="button" size="sm" onClick={() => void setEnabled(true)} disabled={busy}>
            {busy ? "Enabling…" : "Enable access"}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(false);
            setError("");
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{access ? "Newsroom access" : "Give " + detail.person.name + " access"}</DialogTitle>
            <DialogDescription>
              {access
                ? "Change how this person signs in. Their public profile is unaffected."
                : "Create or connect a Byline login for this Person. If the email already belongs to an unlinked account, Byline will connect it instead of creating a duplicate."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void save();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={id + "-email"}>Sign-in email</FieldLabel>
                <Input
                  id={id + "-email"}
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  disabled={busy}
                  value={draft.email}
                  onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                />
                <FieldDescription>This stays private and is never shown on the public profile.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={id + "-role"}>Access level</FieldLabel>
                <Select
                  items={Object.entries(PERSON_ACCESS_ROLES).map(([value, label]) => ({ value, label }))}
                  value={draft.role}
                  onValueChange={(role) => {
                    if (role) setDraft((current) => ({ ...current, role: role as PersonAccessRole }));
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id={id + "-role"} className="w-full" aria-label="Access level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERSON_ACCESS_ROLES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Staff writes assigned work; Editors manage People and editorial workflow; Administrators also manage access and system settings.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={id + "-password"}>
                  {access ? "New local password" : "Local password"} <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Input
                  id={id + "-password"}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  disabled={busy}
                  value={draft.password}
                  onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
                />
                <FieldDescription>
                  {access ? "Leave blank to keep the existing local credential." : "Leave blank for Google-only sign-in; Byline will generate an unknown local credential."}
                </FieldDescription>
              </Field>
            </FieldGroup>
            {error ? <FieldError>{error}</FieldError> : null}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                <ShieldCheck aria-hidden="true" />
                {busy ? "Saving…" : access ? "Save access" : "Give access"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDisable} onOpenChange={(open) => !busy && setConfirmDisable(open)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Byline access?</AlertDialogTitle>
            <AlertDialogDescription>
              {detail.person.name} will be signed out and will not be able to sign back in. Their profile, bylines and story history will stay exactly as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void setEnabled(false)}>
              {busy ? "Disabling…" : "Disable access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
