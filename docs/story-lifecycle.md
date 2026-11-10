# Story lifecycle

A Story has one visible lifecycle. Reporters press actions; they never choose a stage. The code is `packages/newsroom-screens/src/story/lifecycle.ts` (the projection), `apps/newsroom/src/newsroom/lifecycle.ts` (the semantic endpoint) and `packages/newsroom-screens/src/story/attention.ts` (Story Attention).

## Stages

**Pitch → Reporting → Drafting → Review → Ready**, plus two exceptions, **On Hold** and **Dropped**. **Published** is never a stage anyone chooses: it is derived from the Story's publication state.

Review and Ready are not reached by choosing them. Submitting for review moves a Story into Review; the last approval moves it to Ready ([review](review.md)). Typing and autosave never move a Story.

### Projection, not migration

Storage keeps the older workflow values (`story-plans.workflow`, saved views and history all use them), so the lifecycle is a *projection* over them. Nothing was rewritten.

| Stored value | Shown as |
| --- | --- |
| `pitch` | Pitch |
| `assigned`, `reporting` | Reporting |
| `writing` | Drafting |
| `editing` | Review |
| `ready` | Ready |
| `on-hold`, `dropped` | On Hold, Dropped |

New writes use one stored value per stage; `assigned` is never written again (assignment is an attribute, not a stage). Every reader and every incoming stage id goes through `lifecyclePhase` / `storedStage`, so an old link, saved view or API caller that still says `writing` keeps working.

## Moves

`POST /api/byline/stories/:id/lifecycle` with `{ transition, expectedRevision? }`:

| Transition | Who | From → to |
| --- | --- | --- |
| Accept pitch | Editors and the Story's editor | Pitch → Reporting |
| Start drafting | Anyone who manages the Story (its writers) | Reporting → Drafting |
| Put on hold, Drop | Editors and the Story's editor | any open stage → On Hold / Dropped |
| Resume | Editors and the Story's editor | back to the stage it was sidelined from |

Each move locks the Story's plan row and compares the revision the client saw, so a double click or a stale tab never moves a Story twice. Staff cannot force Review or Ready from the Board, the Story header or the API.

**Dropped is not Trash.** Dropped is an editorial decision that keeps the Story in the newsroom's lists as dropped. Move to trash is Payload's recoverable delete and is available in every stage from the Story's publication actions. They are separate and never conflated.

## Creating a Story {#create}

New story is a title and **Create pitch**. Behind **Add details**: Section, writers, deadline and template. Writers and deadline are editor-only; staff creating a Story are its writer. The dialog stays small on purpose: everything else can wait for the Story screen.

## Editor override {#override}

Story details has a **Stage** control for editors. Choosing a stage there is the one way a person sets Review or Ready by hand. It cancels any open review run, so a Story is never in Ready with a review still waiting on someone.

## Story Attention {#attention}

One Story is one unit of attention. Its sources, appointments, media work, checklist and review feed a single deterministic, server-side result that the Board, Peek and the Story screen all read. Nothing in the UI recalculates it, and it is explainable: fixed rules in a fixed priority order, no scoring.

In priority order: routing failed, changes requested, review assigned, deadline overdue, appointment soon, media due, checklist due, waiting on a source, media needed, deadline soon, ready to publish.

A Board card shows its one main signal, and a second only when both are urgent. Peek lists the same signals as **Next**. A signal says where acting on it happens in the Story. Home consumption of Story Attention is intentionally not part of this documentation yet.
