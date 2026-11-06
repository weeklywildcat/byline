import { Card, CardContent } from "@byline/newsroom-ui/ui/card";
import { useWorkspace } from "../workspace/workspace-context";
import { StoryCollectionContext } from "@byline/newsroom-screens/collections/StoryCollectionContext";
export function WorkspaceCollections() {
  const { storyId, client } = useWorkspace();
  return (
    <Card size="sm">
      <CardContent>
        <StoryCollectionContext storyId={storyId} api={client.collections} />
      </CardContent>
    </Card>
  );
}
