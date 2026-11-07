import {
  ContributorBiography,
  ContributorDirectoryCard,
  ContributorProfileHeader,
  type ContributorPresentation,
} from "@byline/ui/contributor-profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@byline/newsroom-ui/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@byline/newsroom-ui/ui/tabs";
import type { CSSProperties } from "react";
import type { PersonProfile } from "./people-model";

export function PersonPreview({
  draft,
  onClose,
  style,
}: {
  draft: PersonProfile;
  onClose: () => void;
  style?: CSSProperties;
}) {
  const person: ContributorPresentation = {
    name: draft.name,
    role: draft.newsroomRole,
    pronouns: draft.pronouns,
    shortBio: draft.shortBio,
    photo: draft.portrait?.url ? { url: draft.portrait.url } : null,
    socialLinks: [
      ...(draft.publicEmail
        ? [{ label: "Email", href: `mailto:${draft.publicEmail}` }]
        : []),
      ...draft.socials.map((social) => ({
        label: social.label,
        href: social.url,
      })),
    ],
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-[min(94vw,1040px)]"
        data-person-preview=""
      >
        <DialogHeader>
          <DialogTitle>Public profile preview</DialogTitle>
          <DialogDescription>
            Your current unsaved draft. Payload is not yet the production
            authority; saving here does not update weeklywildcat.com.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="directory" className="min-h-0 overflow-y-auto">
          <TabsList
            className="h-auto max-w-full flex-wrap"
            aria-label="Profile preview"
          >
            <TabsTrigger value="directory" className="pointer-coarse:min-h-11">
              Staff directory
            </TabsTrigger>
            <TabsTrigger value="profile" className="pointer-coarse:min-h-11">
              Author profile
            </TabsTrigger>
          </TabsList>
          <TabsContent value="directory">
            {draft.directoryVisible ? (
              <div className="contributor-profile-preview" style={style}>
                <div className="author-card-grid">
                  <ContributorDirectoryCard person={person} />
                </div>
                {!draft.hasProfilePage ? (
                  <p className="contributor-preview-note">
                    Listed in the directory without a profile link.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="py-8 text-sm text-muted-foreground">
                This person will not appear in the staff directory. Their
                bylines remain valid.
              </p>
            )}
          </TabsContent>
          <TabsContent value="profile">
            {draft.hasProfilePage ? (
              <div className="contributor-profile-preview" style={style}>
                <ContributorProfileHeader person={person} />
                <ContributorBiography
                  bio={draft.bio}
                  headingId="preview-about"
                />
              </div>
            ) : (
              <p className="py-8 text-sm text-muted-foreground">
                This person is credited byline-only and will not have their own
                profile page.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
