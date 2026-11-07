/**
 * The publication facts homepage resolution needs, and nothing else.
 *
 * Deliberately not `BylinePublicationConfig`: Studio holds an admin REST
 * document and the static site holds a build-time config, and neither should
 * have to become the other to share a resolver. Hosts adapt into this.
 */
export type HomepagePublicationInput = {
  shortName: string;
  name: string;
  organizationName: string;
  contactHref: string;
  social: ReadonlyArray<{ label: string; url: string; service: string }>;
  features: {
    polls: boolean;
    events: boolean;
    sports: boolean;
    newsletter: boolean;
  };
  // "At NSHS" on Weekly Wildcat, "At {organization}" elsewhere. Passed in so no
  // publication identity is baked into the resolver.
  calendarHeading: string;
};

export function publicationText(value: string, publication: HomepagePublicationInput) {
  return value
    .replaceAll("{publication.shortName}", publication.shortName)
    .replaceAll("{publication.name}", publication.name)
    .replaceAll("{publication.organizationName}", publication.organizationName);
}
