import { subscribe } from "@wordpress/data";
import { ensureEditorTheme } from "./ensure-theme";

import "../../../apps/web/views/fonts.css";
import "./editor-canvas.css";

subscribe(() => ensureEditorTheme());
