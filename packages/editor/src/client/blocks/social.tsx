"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, parseSocialPostUrl, socialProviderLabel } from "@byline/article-body";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { SocialPostFigure } from "@byline/ui/article-body";
import { ExternalLink, Link2, Replace } from "lucide-react";
import { useId, useRef, useState } from "react";
import { BlockShell, SettingsSurface } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { BlockIcon } from "../icons";
import { useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

/**
 * The paste-a-post field: an InputGroup with the link icon, the address and
 * an Embed button. The address is checked by the one parser as it is typed;
 * nothing is fetched from the provider to accept it.
 */
function PostAddressField({ initial, onUse, inputRef, submitLabel }: { initial: string; onUse: (url: string) => void; inputRef?: React.Ref<HTMLInputElement>; submitLabel: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [tried, setTried] = useState(false);
  const parsed = parseSocialPostUrl(value);
  const showError = !parsed.ok && (tried || (value.trim() !== "" && parsed.code !== "empty" && parsed.code !== "not-url"));
  const use = () => {
    setTried(true);
    if (parsed.ok) onUse(parsed.url);
  };
  return (
    <Field data-invalid={showError || undefined} className="w-full max-w-xl text-left">
      <FieldLabel htmlFor={id} className="sr-only">Post address</FieldLabel>
      <InputGroup>
        <InputGroupAddon><Link2 /></InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://www.instagram.com/p/…"
          value={value}
          aria-invalid={showError || undefined}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            // A pasted, valid address is used straight away: paste and it's in.
            const text = event.clipboardData.getData("text/plain").trim();
            const pasted = parseSocialPostUrl(text);
            if (pasted.ok) {
              event.preventDefault();
              setValue(text);
              onUse(pasted.url);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              use();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="button" variant="default" onClick={use}>{submitLabel}</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {showError && !parsed.ok ? <FieldError>{parsed.message}</FieldError> : <FieldDescription>Public posts only. YouTube goes in a Video block.</FieldDescription>}
    </Field>
  );
}

/**
 * Social Post: paste a public post's address. The canvas never loads the
 * provider: it draws Byline's facade with the provider, the permalink and the
 * reporter's context, exactly where readers will see them.
 */
export function SocialPostEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("socialPost", node);
  const issues = useReadiness("socialPost", id, node.fields);
  const announce = useAnnounce();
  const input = useRef<HTMLInputElement>(null);
  const caption = useRef<HTMLTextAreaElement>(null);
  const [replacing, setReplacing] = useState(false);
  useFocusWhenCreated(nodeKey, fields.url ? caption : input);
  const readOnly = !node.editable;
  const parsed = parseSocialPostUrl(fields.url);
  const use = (url: string) => {
    const post = parseSocialPostUrl(url);
    set({ url });
    setReplacing(false);
    if (post.ok) announce(`${socialProviderLabel(post.provider)} post added.`);
    window.requestAnimationFrame(() => caption.current?.focus());
  };

  if (!parsed.ok) {
    return (
      <BlockShell type="socialPost" node={node} issues={fields.url ? issues : []}>
        <Empty className="byline-media-empty" data-byline-chrome="" contentEditable={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BlockIcon icon="social" /></EmptyMedia>
            <EmptyTitle>Embed a social post</EmptyTitle>
            <EmptyDescription>Paste a public Instagram, Threads, Facebook, TikTok, X or Bluesky post.</EmptyDescription>
          </EmptyHeader>
          {readOnly ? null : <EmptyContent><PostAddressField initial={fields.url} onUse={use} inputRef={input} submitLabel="Embed" /></EmptyContent>}
        </Empty>
      </BlockShell>
    );
  }

  const label = socialProviderLabel(parsed.provider);
  return (
    <BlockShell
      type="socialPost"
      node={node}
      issues={issues}
      actions={
        <SettingsSurface open={replacing} onOpenChange={setReplacing} title="Replace the post" description="Paste the address of another public post." trigger={<Button type="button" variant="ghost" size="sm"><Replace />Replace post</Button>}>
          <PostAddressField initial="" onUse={use} submitLabel="Use" />
        </SettingsSurface>
      }
    >
      <SocialPostFigure
        provider={parsed.provider}
        postId={parsed.postId}
        url={parsed.url}
        facadeNote={`Social post preview. The ${label} post loads on the published story when a reader asks for it.`}
        caption={<InlineText inputRef={caption} className="byline-caption" label="Context (optional)" placeholder="Why this post matters to the story (optional)" value={fields.caption} maxLength={LIMITS.socialCaption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
      >
        <p className="byline-social-permalink" data-byline-chrome="">
          <a href={parsed.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink aria-hidden="true" />Open post</a>
          <span>{parsed.url}</span>
        </p>
      </SocialPostFigure>
    </BlockShell>
  );
}
