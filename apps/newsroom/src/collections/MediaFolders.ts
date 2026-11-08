import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig, type Config, type PayloadRequest } from "payload";
import { atLeast, newsroomUser, relationId, requestUser, signedIn } from "../access/user";

/**
 * Payload's native folders (`payload-folders`), used by Media only.
 *
 * Folders are logical organization: a Media document's `folder` is a
 * relationship, so filing or moving an asset never changes its file URL or
 * moves its object in storage. Byline adds no folder schema of its own (no
 * parent field, no path, no join table); this file only configures Payload's
 * folder collection through its supported override:
 *
 * - **Access.** Every signed-in newsroom account reads the folder tree (to
 *   browse it and upload into it). Only editors and administrators create,
 *   rename, move or delete folders. Filing an asset is a Media update, so it
 *   follows Media's own access: an editor may move any asset, staff only the
 *   ones they uploaded.
 * - **Safe delete.** Payload's own delete removes every subfolder
 *   recursively and unfiles every asset in them. Byline refuses to delete a
 *   folder that still holds assets or subfolders, so nothing is unfiled or
 *   lost by surprise; empty it first.
 * - **No cycles.** Payload would quietly re-parent a child when a folder is
 *   moved into its own subtree. Byline refuses the move instead.
 * - **Distinct names.** Two folders with the same name side by side would be
 *   indistinguishable in the tree.
 */
export const MEDIA_FOLDERS_SLUG = "payload-folders";
export const FOLDER_NAME_MAX = 120;

const editors = ({ req }: { req: PayloadRequest }) => atLeast(requestUser(req), "editor");

/** The folder's parent chain (nearest first), read as the system: structure only, never assets. */
export async function folderAncestors(req: PayloadRequest, folderId: number | string): Promise<Array<number | string>> {
  const chain: Array<number | string> = [];
  let current: number | string | null = folderId;
  const seen = new Set<string>();
  while (current !== null && !seen.has(String(current))) {
    seen.add(String(current));
    chain.push(current);
    const found = await req.payload.find({ collection: MEDIA_FOLDERS_SLUG, where: { id: { equals: current } }, depth: 0, limit: 1, overrideAccess: true, req, select: { folder: true } });
    current = relationId(found.docs[0]?.folder);
  }
  return chain;
}

const guardStructure: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (typeof data.name === "string") {
    data.name = data.name.trim().replace(/\s+/g, " ");
    if (!data.name) throw new APIError("Give the folder a name.", 400);
    if (data.name.length > FOLDER_NAME_MAX) throw new APIError(`Folder names are at most ${FOLDER_NAME_MAX} characters.`, 400);
  }
  const parent = "folder" in data ? relationId(data.folder) : relationId(originalDoc?.folder);
  const self = operation === "update" ? relationId(originalDoc?.id) : null;
  if (parent !== null && self !== null && "folder" in data) {
    if (String(parent) === String(self)) throw new APIError("A folder can't go inside itself.", 400);
    const chain = await folderAncestors(req, parent);
    if (chain.some((id) => String(id) === String(self))) throw new APIError("A folder can't go inside one of its own subfolders.", 400);
  }
  const name = typeof data.name === "string" ? data.name : originalDoc?.name;
  if (name && (operation === "create" || "name" in data || "folder" in data)) {
    const siblings = await req.payload.find({
      collection: MEDIA_FOLDERS_SLUG,
      where: { and: [parent === null ? { folder: { exists: false } } : { folder: { equals: parent } }, ...(self !== null ? [{ id: { not_equals: self } }] : [])] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
      select: { name: true }
    });
    const key = String(name).toLocaleLowerCase();
    if (siblings.docs.some((sibling) => String(sibling.name ?? "").toLocaleLowerCase() === key)) throw new APIError(`There is already a folder called "${name}" here.`, 400);
  }
  return data;
};

/** Refuse to delete a folder that still holds anything; Payload would delete its subfolders and unfile their assets. */
const refuseNonEmpty: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const [assets, subfolders] = await Promise.all([
    req.payload.count({ collection: "media", where: { folder: { equals: id } }, overrideAccess: true, req }),
    req.payload.count({ collection: MEDIA_FOLDERS_SLUG, where: { folder: { equals: id } }, overrideAccess: true, req })
  ]);
  if (assets.totalDocs || subfolders.totalDocs) {
    const parts = [assets.totalDocs ? `${assets.totalDocs} ${assets.totalDocs === 1 ? "file" : "files"}` : "", subfolders.totalDocs ? `${subfolders.totalDocs} ${subfolders.totalDocs === 1 ? "subfolder" : "subfolders"}` : ""].filter(Boolean);
    throw new APIError(`This folder still holds ${parts.join(" and ")}. Move or remove them before deleting the folder.`, 409);
  }
};

function mediaFolderCollection({ collection }: { collection: Omit<CollectionConfig, "trash"> }): Omit<CollectionConfig, "trash"> {
  return {
    ...collection,
    access: { ...collection.access, read: signedIn, readVersions: editors, create: editors, update: editors, delete: editors },
    admin: { ...collection.admin, group: "System", hidden: ({ user }) => !atLeast(newsroomUser(user), "administrator") },
    fields: collection.fields.map((field) => ("name" in field && field.name === "name" && field.type === "text" ? { ...field, maxLength: FOLDER_NAME_MAX } : field)),
    hooks: {
      ...collection.hooks,
      beforeChange: [guardStructure, ...(collection.hooks?.beforeChange ?? [])],
      // Ours runs first, so Payload's recursive subfolder delete only ever sees an empty folder.
      beforeDelete: [refuseNonEmpty, ...(collection.hooks?.beforeDelete ?? [])]
    }
  };
}

/**
 * Payload's root folder configuration. Media is the only folder-enabled
 * collection, so folders are not collection-specific (no `folderType`), and
 * Payload's own "browse by folder" screen is off: the Byline Media screen is
 * the newsroom's folder browser; raw folders stay an administrator fallback.
 */
export const mediaFolders: Exclude<NonNullable<Config["folders"]>, false> = {
  slug: MEDIA_FOLDERS_SLUG,
  browseByFolder: false,
  collectionSpecific: false,
  collectionOverrides: [mediaFolderCollection]
};
