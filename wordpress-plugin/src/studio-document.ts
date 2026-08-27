import {
  BYLINE_DESIGN_WRITE_SCHEMA_VERSION,
  LEAD_PACKAGE_TYPE,
  isBylinePackageType,
  migrateDesignDocumentV1ToV2,
  parseLeadPackageProps,
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
  // Non-empty when a stored v1 design was migrated on load, so Studio can tell
  // the editor what did not convert instead of silently dropping sections.
  migrationWarnings: string[];
  // True when the document Studio loaded was schema 1. The next save writes v2.
  migratedFromV1: boolean;
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
  theme: string
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

    packages.push({
      id,
      type: item.type,
      props: item.type === LEAD_PACKAGE_TYPE ? parseLeadPackageProps(settings) : settings
    });
  });

  return {
    schemaVersion: BYLINE_DESIGN_WRITE_SCHEMA_VERSION,
    template,
    theme,
    packages
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
    return {
      editorState: designDocumentToEditorState(stored as unknown as BylineDesignDocumentV2),
      migrationWarnings: [],
      migratedFromV1: false
    };
  }

  const { document: migrated, warnings } = migrateDesignDocumentV1ToV2(stored, template);

  return {
    editorState: designDocumentToEditorState(migrated),
    migrationWarnings: warnings,
    migratedFromV1: true
  };
}
