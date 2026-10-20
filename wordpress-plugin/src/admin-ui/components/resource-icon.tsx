import { File, FileSpreadsheet, FileText, Folder, Link2, Presentation, type LucideIcon } from "lucide-react";
import { resourceKind, type ResourceKind } from "../../workspace/resource-model";
import type { StoryResource } from "../../workspace/workspace-types";

const icons: Record<ResourceKind, LucideIcon> = { doc: FileText, sheet: FileSpreadsheet, slides: Presentation, folder: Folder, pdf: File, link: Link2 };

/** The Lucide icon for a story link: document, sheet, slides, Drive folder, PDF or a plain link. */
export function ResourceIcon({ resource }: { resource: Pick<StoryResource, "kind" | "purpose" | "url"> }) {
  const Icon = icons[resourceKind(resource)];
  return <Icon aria-hidden="true" />;
}
