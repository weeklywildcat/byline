import { Camera, Image, Images, Mic, PenTool, Video, type LucideIcon } from "lucide-react";
import type { MediaAssignmentType } from "../workspace/workspace-types";

/** The Lucide icon for a kind of production work, for rows with nobody assigned yet. */
export const mediaTypeIcons: Record<MediaAssignmentType, LucideIcon> = { photo: Camera, gallery: Images, graphic: PenTool, video: Video, audio: Mic, other: Image };
