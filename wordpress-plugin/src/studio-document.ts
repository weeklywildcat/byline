import {
  BYLINE_DESIGN_WRITE_SCHEMA_VERSION,
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  isBylinePackageType,
  legacyBlockLabel,
  migrateDesignDocumentV1ToV2,
  parseBylineDesignDocumentV2,
  parseBriefPackageProps,
  parseInFocusPackageProps,
  parseLeadPackageProps,
  parseMorePackageProps,
  parseNewsletterPackageProps,
  parseOpinionPackageProps,
  parseSportsPackageProps,
  parseSpecialCoveragePackageProps,
  upgradeLegacyBlocksInV2Document,
  type BylineDesignDocumentV2,
  type BylineDesignPackage
} from "@byline/design";

// The adapter between Puck's editor state and the persisted schema v2 document.
//
// Puck remains the editing engine, but its data shape is an implementation
// detail that stops at this boundary. Nothing Puck-specific -- no `editor` key,
// no `layout`, no zone structure -- is written to WordPress.

// Puck's Data shape, narrowed to what the adapter needs. Typed locally so the
// persisted contract does not follow Puck's type changes.
export type PuckEditorState = {
  root: Record<string, unknown>;
  content: Array<{ type: string; props: Record<string, unknown> }>;
};

export type StudioLoadResult = {
  editorState: PuckEditorState;
  // Inert migration data that has no v2 package yet. It is deliberately kept
  // *outside* Puck -- putting it in the editor as fake packages would let an
  // editor drag, configure or delete something the renderers cannot draw -- and
  // is merged back into every document Studio writes.
  //
  // Studio must thread this through to editorStateToDesignDocument on autosave
  // and publish. Dropping it destroys blocks the migration promised to preserve.
  legacy: BylineDesignDocumentV2["legacy"];
  // Non-empty when a stored v1 design was migrated on load, so Studio can tell
  // the editor what did not convert instead of silently dropping sections.
  migrationWarnings: string[];
  // True when the document Studio loaded was schema 1. The next save writes v2.
  migratedFromV1: boolean;
  // How many blocks a *stored schema 2* document was carrying in `legacy` that
  // this Byline version now understands, and which were converted on load. Non-
  // zero means the editor is looking at packages that were not in storage a
  // moment ago, which is worth telling them about.
  recoveredLegacyBlocks: number;
  // Readable types of the blocks that still have no package, for the notice
  // that explains why publishing is held back.
  unsupportedLegacyTypes: string[];
};

const PACKAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Puck identifies items by `props.id`; the design identifies packages by `id`.
// They are kept in sync so selecting a package in the outline selects the same
// package in the preview, and so reordering does not orphan a configuration.
function toEditorItem(designPackage: BylineDesignPackage) {
  return {
    type: designPackage.type,
    props: { ...designPackage.props, id: designPackage.id }
  };
}

export function designDocumentToEditorState(document: BylineDesignDocumentV2): PuckEditorState {
  return {
    root: { props: {} },
    content: document.packages.map(toEditorItem)
  };
}

// Every package normalises its own settings on the way out of the editor, so a
// half-filled field in Puck cannot become a half-filled persisted document.
function parsePackageProps(type: string, settings: Record<string, unknown>) {
  if (type === LEAD_PACKAGE_TYPE) return parseLeadPackageProps(settings);
  if (type === BRIEF_PACKAGE_TYPE) return parseBriefPackageProps(settings);
  if (type === IN_FOCUS_PACKAGE_TYPE) return parseInFocusPackageProps(settings);
  if (type === SPECIAL_COVERAGE_PACKAGE_TYPE) return parseSpecialCoveragePackageProps(settings);
  if (type === OPINION_PACKAGE_TYPE) return parseOpinionPackageProps(settings);
  if (type === SPORTS_PACKAGE_TYPE) return parseSportsPackageProps(settings);
  if (type === MORE_PACKAGE_TYPE) return parseMorePackageProps(settings);
  if (type === NEWSLETTER_PACKAGE_TYPE) return parseNewsletterPackageProps(settings);

  return settings;
}

function packageIdFor(props: Record<string, unknown>, type: string, index: number) {
  const id = props.id;

  return typeof id === "string" && PACKAGE_ID_PATTERN.test(id) ? id : `${type}-${index + 1}`;
}

/**
 * Converts Puck editor state into the persisted schema 2 document.
 *
 * Only known package types are persisted. Anything else in the editor -- a
 * legacy v1 block that has not been converted yet -- is dropped from `packages`
 * rather than being written as an unknown package, because storage validation
 * would reject it and because a half-understood block must not become part of
 * the published contract.
 */
export function editorStateToDesignDocument(
  editorState: PuckEditorState,
  template: string,
  theme: string,
  // Carried forward unchanged from the load. Omitting it on a document that had
  // legacy data is data loss, not a no-op.
  legacy?: BylineDesignDocumentV2["legacy"]
): BylineDesignDocumentV2 {
  const packages: BylineDesignPackage[] = [];
  const seenIds = new Set<string>();

  editorState.content.forEach((item, index) => {
    if (!isBylinePackageType(item.type)) return;

    const props = item.props ?? {};
    let id = packageIdFor(props, item.type, index);

    // Duplicating a package in Puck copies its props, id included.
    while (seenIds.has(id)) id = `${item.type}-${index + 1}-${seenIds.size}`;
    seenIds.add(id);

    // `id` is the package's identity, not one of its settings.
    const { id: _id, ...settings } = props;

    packages.push({ id, type: item.type, props: parsePackageProps(item.type, settings) });
  });

  return {
    schemaVersion: BYLINE_DESIGN_WRITE_SCHEMA_VERSION,
    template,
    theme,
    packages,
    // Merged back verbatim. These blocks are never edited here, only preserved,
    // so a future package can convert them without losing the original data.
    ...(legacy && legacy.unconvertedBlocks.length ? { legacy } : {})
  };
}

/**
 * Loads any stored design into editor state.
 *
 * A schema 1 document is migrated explicitly first; it is never interpreted
 * directly by the editor. That keeps exactly one editor-facing schema.
 */
export function loadDesignIntoEditor(document: unknown, template: string): StudioLoadResult {
  const stored = (document ?? {}) as Record<string, unknown>;

  if (stored.schemaVersion === 2) {
    // Validated, not cast: a stored document that no longer satisfies the schema
    // must fail here rather than reaching the editor half-formed.
    const parsed = parseBylineDesignDocumentV2(stored, template);
    // A v2 document can still be carrying legacy data from an earlier migration
    // that had no mapping for it. Retry it against the current mappings instead
    // of forwarding it untouched: carrying it forward is what left production
    // designs permanently unpublishable.
    const upgraded = upgradeLegacyBlocksInV2Document(parsed);

    return {
      editorState: designDocumentToEditorState(upgraded.document),
      legacy: upgraded.document.legacy,
      migrationWarnings: upgraded.warnings,
      migratedFromV1: false,
      recoveredLegacyBlocks: upgraded.recoveredBlocks,
      unsupportedLegacyTypes: upgraded.unsupportedTypes
    };
  }

  const { document: migrated, warnings } = migrateDesignDocumentV1ToV2(stored, template);

  return {
    editorState: designDocumentToEditorState(migrated),
    legacy: migrated.legacy,
    migrationWarnings: warnings,
    migratedFromV1: true,
    // A v1 document is converted in full here; nothing was recovered from a
    // previous conversion because there was no previous conversion.
    recoveredLegacyBlocks: 0,
    unsupportedLegacyTypes: [
      ...new Set((migrated.legacy?.unconvertedBlocks ?? []).map((block) => legacyBlockLabel(block.type)))
    ]
  };
}
