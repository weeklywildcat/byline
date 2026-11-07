/** Types for the static-export verifier's reusable checks (the script itself is plain ESM). */
export function verifyExportBoundary(root: string): Promise<void>;
export function verifyPublicationMedia(root: string): Promise<number>;
export function verifyNoPrivateNewsroomReferences(root: string, env?: Record<string, string | undefined>): Promise<void>;
export function carriesImageMetadata(data: Uint8Array, kind: "jpg" | "webp"): boolean;
