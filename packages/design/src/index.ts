export type BylineDesignDocument = {
  schemaVersion: number;
  template: string;
  theme: string;
  editor: {
    engine: "puck";
    version: string;
  };
  layout: {
    root: Record<string, unknown>;
    content: Array<{ type: string; props: Record<string, unknown> }>;
  };
  baseRevisionId?: number;
  modifiedAt?: string;
};

export type PublishedBylineDesign = {
  document: BylineDesignDocument;
  revision: number;
  modifiedAt: string | null;
};

export class BylineDesignCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BylineDesignCompatibilityError";
  }
}

export function parsePublishedBylineDesign(value: unknown, template: string): PublishedBylineDesign {
  if (!value || typeof value !== "object") {
    throw new BylineDesignCompatibilityError(`Published design ${template} is missing or malformed.`);
  }
  const published = value as Record<string, unknown>;
  const document = published.document as Record<string, unknown> | undefined;
  const editor = document?.editor as Record<string, unknown> | undefined;
  const layout = document?.layout as Record<string, unknown> | undefined;

  if (document?.schemaVersion !== 1) {
    throw new BylineDesignCompatibilityError(
      `Published design ${template} uses unsupported schema ${String(document?.schemaVersion ?? "unknown")}; this frontend supports schema 1.`
    );
  }
  if (document.template !== template || typeof document.theme !== "string") {
    throw new BylineDesignCompatibilityError(`Published design ${template} has mismatched template or theme identity.`);
  }
  if (editor?.engine !== "puck" || typeof editor.version !== "string") {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an unsupported editor contract.`);
  }
  if (!layout || !layout.root || typeof layout.root !== "object" || !Array.isArray(layout.content)) {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an invalid layout.`);
  }
  if (typeof published.revision !== "number" || !Number.isInteger(published.revision) || published.revision < 0) {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an invalid revision.`);
  }

  return {
    document: document as BylineDesignDocument,
    revision: published.revision,
    modifiedAt: typeof published.modifiedAt === "string" ? published.modifiedAt : null
  };
}
