import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "../home/ui/button";
import { stateLine, writerNames } from "./workspace-model";
import { workingDraft } from "./resource-model";
import { useWorkspace } from "./workspace-context";

export function WorkspaceHeader() {
  const { data, storiesUrl, caps } = useWorkspace();
  const { story } = data;
  const writers = writerNames(data);
  const draft = workingDraft(data.resources);
  const preview = data.previewUrl;
  return <header className="ws-header">
    <a className="ws-back" href={storiesUrl}><ArrowLeft aria-hidden="true" />Stories</a>
    <div className="ws-header-main">
      <div className="ws-header-copy">
        <h1>{story.title || "Untitled story"}</h1>
        <p className="ws-state-line">{stateLine(data)}</p>
        <p className="ws-people-line">{writers.length ? writers.join(" · ") : "No writers yet"}{story.editor ? <span className="ws-editor">Editor: {story.editor.name}</span> : null}</p>
        {draft ? <p className="ws-draft-link"><a href={draft.url} target="_blank" rel="noopener noreferrer">Open working draft<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></p> : null}
      </div>
      <div className="ws-header-actions">
        {preview ? <Button variant="outline" render={<a href={preview} target="_blank" rel="noopener noreferrer" />}>Preview<ArrowUpRight aria-hidden="true" /></Button> : null}
        {caps.editArticle && story.editUrl ? <Button render={<a href={story.editUrl} />}>Edit article</Button> : null}
      </div>
    </div>
  </header>;
}
