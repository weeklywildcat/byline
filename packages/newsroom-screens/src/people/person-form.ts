import {
  validPersonSocialUrl,
  type PersonCapabilities,
  type PersonPatch,
  type PersonProfile,
} from "./people-model";

export function clonePerson(person: PersonProfile): PersonProfile {
  return {
    ...person,
    portrait: person.portrait ? { ...person.portrait } : null,
    socials: person.socials.map((social) => ({ ...social })),
  };
}

/** Send only edited fields; a self-service request never contains editorial fields. */
export function personPatch(
  draft: PersonProfile,
  saved: PersonProfile,
  capabilities: PersonCapabilities,
): PersonPatch {
  const input: PersonPatch = { expectedUpdatedAt: saved.updatedAt };
  const profile = [
    "name",
    "pronouns",
    "shortBio",
    "bio",
    "publicEmail",
    "socials",
  ] as const;
  for (const key of profile)
    if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key]))
      Object.assign(input, { [key]: draft[key] });
  if ((draft.portrait?.id ?? null) !== (saved.portrait?.id ?? null))
    input.portrait = draft.portrait?.id ?? null;
  if (capabilities.editEditorialIdentity)
    for (const key of [
      "slug",
      "newsroomRole",
      "status",
      "directoryVisible",
      "hasProfilePage",
    ] as const)
      if (draft[key] !== saved[key])
        Object.assign(input, { [key]: draft[key] });
  return input;
}

export function personErrors(draft: PersonProfile): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Give this person a name.";
  if (
    draft.publicEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.publicEmail)
  )
    errors.publicEmail = "Use a valid public email, or leave it empty.";
  draft.socials.forEach((social, index) => {
    if (!social.label.trim())
      errors[`label${index}`] = "Give this link a service or label.";
    if (!validPersonSocialUrl(social.url))
      errors[`url${index}`] = "Use a full https:// link.";
  });
  return errors;
}

export type PersonWork = {
  dirty: boolean;
  saving: boolean;
  discard: () => void;
};
