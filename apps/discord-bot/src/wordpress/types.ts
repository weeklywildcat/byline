export type WorkflowStatus = 'pitch' | 'assigned' | 'reporting' | 'writing' | 'editing' | 'ready' | 'on-hold' | 'dropped' | 'published';
export interface StoryUser { id: number; name: string; discordUserId: string }
export interface Story {
  id: number; title: string; status: WorkflowStatus; postStatus: string; writer: StoryUser | null; editor: StoryUser | null;
  deadline: string; section: string; visuals: string; wordpressUrl: string; publicUrl: string; featuredImageUrl: string; updatedAt: string;
  discord: { threadId: string; cardMessageId: string; publishMessageId: string; announcementMessageId: string };
}
export interface ResolvedUser { user: StoryUser; capabilities: { editPosts: boolean; editOthersPosts: boolean; publishPosts: boolean; manageOptions: boolean } }
export interface CreateStoryResult { created: boolean; story: Story }
