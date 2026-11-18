"use client";

import "../polls-logic.css";

import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@byline/newsroom-ui/ui/drawer";
import {
  Background, BaseEdge, Handle, MarkerType, Position, ReactFlow, useUpdateNodeInternals,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance, type Viewport
} from "@xyflow/react";
import { CircleAlert, GitBranch, Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { newCondition, writeConditions, type Condition } from "../../polls/engine/condition-builder";
import { choicesFor, describeCondition, sectionLabel } from "../../polls/engine/logic";
import {
  changeRelevance, choiceHandle, connectionProblem, END, ownerId, projectLogic, projectTestPath, questionId, SHOWN_WHEN, START,
  type Dependency, type LogicTarget
} from "../../polls/engine/logic-map";
import { isAnswerable, KIND_LABELS, type Answers, type AnswerState, type Choice, type Group, type Question, type SurveyDefinition } from "../../polls/engine/types";
import { PollSelect } from "./fields";
import { arrangeLogicMap, MAX_MAP_CHOICES, QUESTION_WIDTH, TERMINAL_WIDTH } from "./logic-layout";
import type { Positions } from "./logic-positions";
import { RuleEditor } from "./RuleEditor";
import { TestPathAnswer } from "./TestPathAnswer";

const ORDER_IN = "order-in";
const ORDER_OUT = "order-out";
const ANSWER = "answer";
const HANDLE_TOP = 23;
const FIT = { padding: 0.16 };
const ARIA = {
  "node.a11yDescription.default": "Press Enter or Space to select. Arrow keys move the map card. Use the question and section controls to edit this poll.",
  "edge.a11yDescription.default": "Press Enter or Space to edit the condition. Delete removes a builder condition and offers Undo.",
  "handle.ariaLabel": "Display logic connection"
};
const ORDER_MARKER = { type: MarkerType.ArrowClosed, color: "var(--border)", width: 15, height: 15 };
const RULE_MARKER = { type: MarkerType.ArrowClosed, color: "var(--primary)", width: 16, height: 16 };

type CardData = {
  title: string;
  subtitle?: string;
  section?: string;
  required?: boolean;
  conditional?: boolean;
  sectionCard?: boolean;
  terminal?: boolean;
  invalid?: boolean;
  orderIn?: boolean;
  orderOut?: boolean;
  source?: boolean;
  choices?: readonly Choice[];
  additionalChoices?: number;
  hiddenByPath?: boolean;
  shownByPath?: boolean;
};
type MapNode = Node<CardData, "pollCard">;
type MapEdge = Edge<{ dependency?: Dependency; lane?: number }> & { pathOptions?: { offset: number } };

const laneHeight = (lane: number) => 206 + lane * 29;

function LogicConnector({ sourceX, sourceY, targetX, targetY, data, label, markerEnd, interactionWidth, labelBgPadding, labelBgBorderRadius }: EdgeProps<MapEdge>) {
  // Distant dependencies travel beneath the order row, leaving the intervening
  // questions and their connection handles legible.
  const lane = data?.lane ?? 0;
  const y = Math.max(laneHeight(lane), sourceY + 48, targetY + 48);
  const outset = 26 + (lane % 6) * 7;
  const left = sourceX + outset;
  const right = targetX - outset;
  const radius = 10;
  const path = `M ${sourceX} ${sourceY} H ${left - radius} Q ${left} ${sourceY} ${left} ${sourceY + radius}
      V ${y - radius} Q ${left} ${y} ${left + radius} ${y} H ${right - radius}
      Q ${right} ${y} ${right} ${y - radius} V ${targetY + radius}
      Q ${right} ${targetY} ${right + radius} ${targetY} H ${targetX}`;
  return <BaseEdge path={path} labelX={(sourceX + targetX) / 2} labelY={y} label={label}
    markerEnd={markerEnd} interactionWidth={interactionWidth} labelBgPadding={labelBgPadding} labelBgBorderRadius={labelBgBorderRadius} />;
}
const EDGE_TYPES = { pollRule: LogicConnector };

const LogicCard = memo(function LogicCard({ id, data, selected }: NodeProps<MapNode>) {
  const refreshHandles = useUpdateNodeInternals();
  useEffect(() => { refreshHandles(id); }, [id, data.choices, refreshHandles]);
  return (
    <div className={cn(
      "relative min-w-0 rounded-lg border bg-card text-card-foreground",
      data.terminal ? "px-3 py-3 text-center" : "px-3 py-2.5",
      data.sectionCard && "border-dashed bg-muted/70",
      selected && "border-primary ring-2 ring-primary/30",
      data.hiddenByPath && "opacity-45",
      data.shownByPath && "border-primary"
    )}>
      {data.orderIn ? <Handle id={ORDER_IN} type="target" position={Position.Left} isConnectable={false} className="poll-order-handle" style={{ top: HANDLE_TOP }} /> : null}
      {data.orderOut ? <Handle id={ORDER_OUT} type="source" position={Position.Right} isConnectable={false} className="poll-order-handle" style={{ top: HANDLE_TOP }} /> : null}
      {!data.terminal ? <Handle id={SHOWN_WHEN} type="target" position={Position.Left} className="poll-rule-target" style={{ top: 55 }} /> : null}
      {data.source ? <Handle id={ANSWER} type="source" position={Position.Right} isConnectableEnd={false} style={{ top: 55 }} /> : null}
      {data.subtitle ? <p className="truncate text-xs leading-5 text-muted-foreground">{data.subtitle}</p> : null}
      <p data-poll-map-label="" className={cn("line-clamp-2 text-sm font-semibold wrap-anywhere", data.terminal && "leading-5")}>{data.title}</p>
      {data.section ? <p className="mt-1 truncate text-xs text-muted-foreground">{data.section}</p> : null}
      {data.choices?.length ? (
        <ul className="mt-2 grid gap-0.5 border-t pt-1.5 text-xs">
          {data.choices.map((choice) => (
            <li key={choice.name} className="relative py-0.5">
              <span className="block truncate pr-2">{choice.label}</span>
              <Handle id={choiceHandle(choice.name)} type="source" position={Position.Right} isConnectableEnd={false} style={{ right: -13 }} />
            </li>
          ))}
          {data.additionalChoices ? <li className="text-muted-foreground">+{data.additionalChoices} more</li> : null}
        </ul>
      ) : null}
      {data.required || data.conditional || data.invalid || data.hiddenByPath ? (
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          {data.required ? <Badge variant="secondary">Required</Badge> : null}
          {data.conditional ? <Badge variant="outline"><GitBranch />Conditional</Badge> : null}
          {data.invalid ? <Badge variant="destructive"><CircleAlert />Check rule</Badge> : null}
          {data.hiddenByPath ? <Badge variant="outline">Hidden</Badge> : null}
        </div>
      ) : null}
    </div>
  );
});
const NODE_TYPES = { pollCard: LogicCard };

function sectionRange(target: LogicTarget): string {
  if (!target.members.length) return "No questions";
  const ranges: string[] = [];
  let first = target.members[0], last = first;
  for (const index of target.members.slice(1)) {
    if (index === last + 1) { last = index; continue; }
    ranges.push(first === last ? `Q${first + 1}` : `Q${first + 1}–Q${last + 1}`);
    first = last = index;
  }
  ranges.push(first === last ? `Q${first + 1}` : `Q${first + 1}–Q${last + 1}`);
  return ranges.join(", ");
}

type EditRequest =
  | { kind: "rule"; target: string; seed?: Condition; edge?: Dependency }
  | { kind: "destination"; source: string };

type Props = {
  definition: SurveyDefinition;
  issues: ReadonlyMap<Question | Group, string[]>;
  selectedQuestion: string | null;
  onSelectQuestion: (name: string) => void;
  onEditQuestion: (name: string) => void;
  onChange: (update: (draft: SurveyDefinition) => SurveyDefinition) => void;
  positions: Positions;
  onPositions: (update: (positions: Positions) => Positions, persist?: boolean) => void;
  viewport: Viewport | undefined;
  onViewport: (viewport: Viewport | undefined) => void;
};

export function LogicMap({ definition, issues, selectedQuestion, onSelectQuestion, onEditQuestion, onChange, positions, onPositions, viewport, onViewport }: Props) {
  const wide = useMediaQuery("(min-width: 1200px)", true);
  const coarse = useMediaQuery("(any-pointer: coarse)");
  const desktop = wide && !coarse;
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [request, setRequest] = useState<EditRequest | null>(null);
  const [destination, setDestination] = useState("");
  const [testAnswers, setTestAnswers] = useState<Answers | null>(null);
  const [testReset, setTestReset] = useState(0);
  const [connectionNotice, setConnectionNotice] = useState("");
  const instance = useRef<ReactFlowInstance<MapNode, MapEdge> | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const actionTrigger = useRef<HTMLButtonElement>(null);
  const map = useMemo(() => projectLogic(definition), [definition]);
  const defaultPositions = useMemo(() => arrangeLogicMap(map), [map]);
  const path = useMemo(() => testAnswers ? projectTestPath(definition, map, testAnswers) : null, [definition, map, testAnswers]);

  const selected = selectedSection ?? (selectedQuestion ? questionId(selectedQuestion) : "");
  const selectedTarget = map.targets.get(selected);
  const pickedQuestion = selectedTarget?.kind === "question" ? map.questions.get(selectedTarget.name)?.question : undefined;
  const ruleTarget = request?.kind === "rule" ? map.targets.get(request.target) : undefined;
  const pickedSource = request?.kind === "destination" ? map.questions.get(request.source) : undefined;
  const destinations = pickedSource ? [...map.targets].filter(([, target]) => !connectionProblem(pickedSource.question, pickedSource.index, target)) : [];
  const editorOpen = Boolean(ruleTarget || pickedSource);
  const activeEdge = request?.kind === "rule" ? request.edge?.id : undefined;

  const baseNodes = useMemo(() => {
    const terminal = (id: string, title: string): MapNode => ({
      id, type: "pollCard", position: defaultPositions[id], width: TERMINAL_WIDTH,
      data: { title, terminal: true, orderIn: id === END, orderOut: id === START },
      ariaLabel: title, selectable: false, focusable: false, draggable: false, deletable: false
    });
    const card = (id: string, target: LogicTarget): MapNode => {
      const { item } = target;
      const question = target.kind === "question" ? map.questions.get(target.name)?.question : undefined;
      const choices = question ? choicesFor(definition, question) : [];
      const title = item.label || (question ? "Untitled question" : "Untitled section");
      const conditional = Boolean(item.relevant || item.groups.some((name) => map.targets.get(ownerId({ kind: "section", name }))?.item.relevant));
      const invalid = issues.has(item);
      const subtitle = question ? `Q${target.start + 1} · ${KIND_LABELS[question.kind]}` : `Section · ${sectionRange(target)}`;
      return {
        id, type: "pollCard", position: defaultPositions[id], width: QUESTION_WIDTH, deletable: false,
        ariaLabel: `${question ? `Question ${target.start + 1}` : "Section"}, ${title}${conditional ? ", conditional" : ""}${invalid ? ", has errors" : ""}`,
        data: {
          title, subtitle, section: question ? sectionLabel(definition, question) : item.groups.length
            ? map.targets.get(ownerId({ kind: "section", name: item.groups.at(-1)! }))?.item.label : undefined,
          conditional, invalid, sectionCard: !question,
          orderIn: Boolean(question), orderOut: Boolean(question), source: question && isAnswerable(question),
          required: question && isAnswerable(question) && question.required,
          choices: choices.slice(0, MAX_MAP_CHOICES), additionalChoices: Math.max(0, choices.length - MAX_MAP_CHOICES)
        }
      };
    };
    return [terminal(START, "Start"), ...[...map.targets].map(([id, target]) => card(id, target)), terminal(END, "Thank you")];
  }, [definition, issues, map, defaultPositions]);

  const pathVariants = useMemo(() => baseNodes.map((node) => {
    if (node.data.terminal) return { shown: node, hidden: node };
    const variant = (shown: boolean): MapNode => ({
      ...node, data: { ...node.data, shownByPath: shown, hiddenByPath: !shown },
      domAttributes: { "data-path-visible": String(shown) } as MapNode["domAttributes"]
    });
    return { shown: variant(true), hidden: variant(false) };
  }), [baseNodes]);
  const pathNodes = useMemo(() => path ? pathVariants.map(({ shown, hidden }) => path.nodes.has(shown.id) ? shown : hidden)
    : baseNodes, [baseNodes, path, pathVariants]);

  const nodes = useMemo(() => pathNodes.map((node): MapNode => {
    const position = positions[node.id] ?? node.position;
    const selectedNode = selected === node.id;
    return position === node.position && !selectedNode ? node : { ...node, position, selected: selectedNode };
  }), [pathNodes, positions, selected]);

  const baseEdges = useMemo(() => {
    const order = map.order.slice(1).map((target, index): MapEdge => ({
      id: `order:${target}`, source: map.order[index], target, sourceHandle: ORDER_OUT, targetHandle: ORDER_IN,
      selectable: false, focusable: false, deletable: false, interactionWidth: 0, type: "smoothstep",
      className: "poll-order", markerEnd: ORDER_MARKER, ariaLabel: "Question order"
    }));
    const orderPositions = new Map(map.order.map((id, index) => [id, index]));
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    const distant = map.dependencies.map((dependency) => ({
      dependency, start: (orderPositions.get(dependency.source) ?? 1) - 1, end: map.targets.get(dependency.target)?.start ?? 0
    })).filter(({ start, end }) => end > start + 1).sort((a, b) => a.start - b.start || a.end - b.end);
    for (const { dependency, start, end } of distant) {
      const open = ends.findIndex((previous) => previous < start);
      const lane = open < 0 ? ends.length : open;
      ends[lane] = end;
      lanes.set(dependency.id, lane % 12);
    }
    const dependencies = map.dependencies.map((dependency): MapEdge => {
      const { source, target, sourceHandle } = dependency;
      const node = baseNodes[(orderPositions.get(source) ?? 0)];
      const lane = lanes.get(dependency.id);
      const hasChoice = sourceHandle && node?.data.choices?.some((choice) => choiceHandle(choice.name) === sourceHandle);
      return {
        id: dependency.id, source, target, sourceHandle: hasChoice ? sourceHandle : node?.data.source ? ANSWER : ORDER_OUT, targetHandle: SHOWN_WHEN,
        label: dependency.label.length > 32 ? `${dependency.label.slice(0, 30)}…` : dependency.label,
        labelBgPadding: [6, 4], labelBgBorderRadius: 4,
        className: "poll-dependency", type: lane === undefined ? "smoothstep" : "pollRule",
        pathOptions: { offset: 22 + (dependency.row ?? 0) % 4 * 10 },
        markerEnd: RULE_MARKER, interactionWidth: 22, ariaLabel: dependency.description,
        data: { dependency, lane }, deletable: dependency.row !== undefined
      };
    });
    return [...order, ...dependencies];
  }, [baseNodes, map]);
  const edges = useMemo(() => baseEdges.map((edge): MapEdge => {
    if (!edge.data?.dependency || (!path && activeEdge !== edge.id)) return edge;
    return {
      ...edge, selected: activeEdge === edge.id,
      domAttributes: path ? { "data-active": String(path.active.has(edge.id)) } as MapEdge["domAttributes"] : undefined
    };
  }), [baseEdges, activeEdge, path]);

  const selectTarget = (id: string) => {
    const target = map.targets.get(id);
    if (!target) return;
    setSelectedSection(target.kind === "section" ? id : null);
    if (target.kind === "question") onSelectQuestion(target.name);
  };
  const focusTarget = (id: string) => {
    selectTarget(id);
    const node = instance.current?.getNode(id);
    if (!node) return;
    const zoom = Math.max(0.72, instance.current?.getZoom() ?? 0.72);
    void instance.current?.setCenter(node.position.x + QUESTION_WIDTH / 2, node.position.y + (node.measured?.height ?? 96) / 2, { zoom });
  };
  const openEditor = (next: EditRequest) => {
    focusReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRequest(next);
  };
  const closeEditor = () => {
    setRequest(null);
    if (desktop) {
      window.requestAnimationFrame(() => {
        const target = focusReturn.current;
        (target?.isConnected && target !== document.body ? target : actionTrigger.current)?.focus({ preventScroll: true });
      });
    }
  };
  useEffect(() => { if (desktop && editorOpen) editorHeading.current?.focus({ preventScroll: true }); }, [desktop, editorOpen, request]);

  const sourceFor = (connection: Pick<Connection, "source"> | null) => {
    if (!connection?.source.startsWith("question:")) return undefined;
    return map.questions.get(connection.source.slice("question:".length));
  };
  const validateConnection = (connection: Pick<MapEdge, "source" | "target" | "targetHandle">) => {
    if (connection.targetHandle !== SHOWN_WHEN) return "Drag to the ring on the left of a question or section.";
    const source = sourceFor(connection);
    return connectionProblem(source?.question, source?.index ?? -1, map.targets.get(connection.target));
  };
  const connect = (connection: Connection) => {
    const source = sourceFor(connection)?.question;
    if (!source || !isAnswerable(source) || validateConnection(connection)) return;
    const choice = connection.sourceHandle?.startsWith("choice:") ? connection.sourceHandle.slice("choice:".length) : undefined;
    selectTarget(connection.target);
    setConnectionNotice("");
    openEditor({ kind: "rule", target: connection.target, seed: newCondition(definition, source, choice) });
  };
  const openEdge = (edge: MapEdge) => {
    if (!edge.data?.dependency) return;
    selectTarget(edge.target);
    openEditor({ kind: "rule", target: edge.target, edge: edge.data.dependency });
  };

  const applyRule = (target: LogicTarget, relevant: string | undefined, removed = relevant === undefined) => {
    const previous = target.item.relevant;
    closeEditor();
    if (previous === relevant) return;
    onChange((draft) => changeRelevance(draft, target, relevant));
    if (previous && removed) {
      toast.success("Logic removed", {
        action: { label: "Undo", onClick: () => onChange((draft) => {
          const items = target.kind === "section" ? draft.groups : draft.questions;
          const item = items.find((entry) => entry.name === target.name);
          return item && item.relevant === relevant ? changeRelevance(draft, target, previous) : draft;
        }) }
      });
    } else toast.success(previous ? "Logic updated" : "Logic added");
  };
  const removeDependency = (dependency: Dependency) => {
    const target = map.targets.get(dependency.target);
    if (!target || target.builder.kind !== "simple" || dependency.row === undefined) return;
    const rowIndex = dependency.row;
    const relevant = writeConditions(definition, target.builder.join, target.builder.rows.filter((_row, index) => index !== rowIndex)) || undefined;
    applyRule(target, relevant, true);
  };

  const move = (changes: NodeChange<MapNode>[]) => {
    const moved = changes.filter((change) => change.type === "position");
    if (moved.length) onPositions((previous) => {
      const next = Object.fromEntries(Object.entries(previous).filter(([id]) => map.targets.has(id)));
      for (const change of moved) {
        if (!change.position || !map.targets.has(change.id)) continue;
        next[change.id] = change.position;
      }
      return next;
    }, moved.some((change) => !change.dragging));
    const selection = changes.find((change) => change.type === "select" && change.selected);
    if (selection?.type === "select") selectTarget(selection.id);
  };

  const resetPath = () => {
    setTestAnswers({});
    setTestReset((value) => value + 1);
  };
  const testQuestion = path && pickedQuestion && isAnswerable(pickedQuestion) && path.visible.has(pickedQuestion.name) ? pickedQuestion : undefined;
  const answer = (state: AnswerState | null) => {
    if (!testQuestion || !path) return;
    const next = state ? { ...path.answers, [testQuestion.name]: state } : { ...path.answers };
    if (!state) delete next[testQuestion.name];
    setTestAnswers(projectTestPath(definition, map, next).answers);
  };

  const labelFor = (target: LogicTarget) => target.kind === "question"
    ? `Q${target.start + 1} · ${target.item.label || "Untitled question"}`
    : `Section · ${target.item.label || "Untitled section"}`;
  const targetOptions = [...map.targets].map(([id, target]) => ({ value: id, label: labelFor(target) }));
  const inheritedRules = selectedTarget?.item.groups.flatMap((name) => {
    const section = map.targets.get(ownerId({ kind: "section", name }));
    return section?.item.relevant ? [section] : [];
  }) ?? [];

  const details = selectedTarget ? (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold wrap-anywhere">{labelFor(selectedTarget)}</h3>
      {selectedTarget.kind === "section" ? <p className="text-sm text-muted-foreground">Controls {sectionRange(selectedTarget)}.</p> : null}
      {issues.get(selectedTarget.item)?.map((issue, index) => <p key={index} className="text-sm wrap-anywhere text-destructive">{issue}</p>)}
      {selectedTarget.item.relevant || inheritedRules.length ? (
        <details className="text-sm">
          <summary className="poll-logic-touch cursor-pointer py-2 font-medium">{path?.nodes.has(selected) ? "Why is this shown?" : "Display conditions"}</summary>
          {selectedTarget.item.relevant ? <p className="wrap-anywhere pb-1">{describeCondition(definition, selectedTarget.item.relevant)}</p> : null}
          {inheritedRules.map((section) => <p key={section.name} className="wrap-anywhere pb-1">{section.item.label || "Section"} · {describeCondition(definition, section.item.relevant)}</p>)}
        </details>
      ) : null}
      {path ? (
        <div className="grid gap-2 border-t pt-2">
          <p className="text-sm font-medium">{path.nodes.has(selected) ? "On the respondent’s path" : "Hidden on this path"}</p>
          {testQuestion ? <TestPathAnswer key={`${testQuestion.name}:${testReset}`} definition={definition} question={testQuestion} answers={path.answers} onAnswer={answer} /> : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const editorTitle = ruleTarget ? `Show “${ruleTarget.item.label || "Untitled"}” when` : "Add logic";
  const editor = ruleTarget && request?.kind === "rule" ? (
    <>
      <RuleEditor key={`${request.target}:${activeEdge ?? "target"}:${ruleTarget.item.relevant ?? ""}`} definition={definition} target={ruleTarget} seed={request.seed}
        focusedRow={request.edge?.row} onApply={(expression) => applyRule(ruleTarget, expression)} onCancel={closeEditor} />
      {request.edge?.row !== undefined ? (
        <Button type="button" variant="ghost" className="poll-logic-touch self-start text-destructive" onClick={() => removeDependency(request.edge!)}>Remove condition</Button>
      ) : null}
    </>
  ) : pickedSource ? (
    <>
      <p className="text-sm text-muted-foreground wrap-anywhere">Choose what an answer to “{pickedSource.question.label}” can show.</p>
      <PollSelect label="Destination" value={destination} options={destinations.map(([id, target]) => ({ value: id, label: labelFor(target) }))} onChange={setDestination} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="poll-logic-touch" disabled={!destination} onClick={() => {
          if (!isAnswerable(pickedSource.question) || !destinations.some(([id]) => id === destination)) return;
          selectTarget(destination);
          setRequest({ kind: "rule", target: destination, seed: newCondition(definition, pickedSource.question) });
        }}>Continue</Button>
        <Button type="button" className="poll-logic-touch" variant="outline" onClick={closeEditor}>Cancel</Button>
      </div>
    </>
  ) : null;

  const canAdd = pickedQuestion && isAnswerable(pickedQuestion) && [...map.targets.values()].some((target) => !connectionProblem(pickedQuestion, map.questions.get(pickedQuestion.name)!.index, target));
  const fit = () => {
    const flow = instance.current;
    if (!flow) return;
    const bounds = flow.getNodesBounds(flow.getNodes());
    const lane = Math.max(-1, ...edges.map((edge) => edge.data?.lane ?? -1));
    if (lane >= 0) bounds.height = Math.max(bounds.height, laneHeight(lane) - bounds.y + 20);
    void flow.fitBounds(bounds, FIT);
  };
  const initialFit = {
    ...FIT, maxZoom: 0.95,
    nodes: map.order.length > 6 ? map.order.slice(0, 3).map((id) => ({ id })) : undefined
  };

  return (
    <div className="byline-poll-logic grid min-w-0 gap-3" data-polls-logic="">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ButtonGroup aria-label="Map controls">
          <Button type="button" variant="outline" size="icon" className="poll-logic-touch" aria-label="Zoom in" onClick={() => void instance.current?.zoomIn()}><Plus /></Button>
          <Button type="button" variant="outline" size="icon" className="poll-logic-touch" aria-label="Zoom out" onClick={() => void instance.current?.zoomOut()}><Minus /></Button>
          <Button type="button" variant="outline" className="poll-logic-touch" onClick={fit}><Maximize data-icon="inline-start" />Fit map</Button>
        </ButtonGroup>
        <Button type="button" variant="outline" className="poll-logic-touch" onClick={() => {
          onPositions(() => ({}));
          window.requestAnimationFrame(fit);
          toast.success("Map reset");
        }}><RotateCcw data-icon="inline-start" />Reset layout</Button>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button type="button" aria-pressed={Boolean(path)} variant={path ? "secondary" : "outline"} className="poll-logic-touch"
            onClick={() => path ? setTestAnswers(null) : resetPath()}>{path ? "Exit test path" : "Test path"}</Button>
          {path ? <Button type="button" variant="outline" className="poll-logic-touch" onClick={resetPath}>Reset answers</Button> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span aria-hidden className="w-5 border-t border-border" />Question order</span>
        <span className="flex items-center gap-1.5"><GitBranch className="size-4 text-primary" aria-hidden />Display logic</span>
        {path ? <span role="status" aria-live="polite">{path.visible.size} of {definition.questions.length} on the test path</span>
          : <span>Drag an answer handle or choose Add logic.</span>}
      </div>
      <div className="poll-logic-panel flex min-w-0 flex-wrap items-center gap-2">
        <PollSelect label="Question or section" className="w-full max-w-sm" value={selectedTarget ? selected : ""} options={targetOptions} disabled={!targetOptions.length} onChange={focusTarget} />
        <Button ref={actionTrigger} type="button" variant="outline" className="poll-logic-touch" disabled={!canAdd || Boolean(path)}
          onClick={() => {
            if (!pickedQuestion) return;
            setDestination("");
            openEditor({ kind: "destination", source: pickedQuestion.name });
          }}>Add logic</Button>
        <Button type="button" variant="outline" className="poll-logic-touch" disabled={!selectedTarget || Boolean(path)}
          onClick={() => openEditor({ kind: "rule", target: selected })}>Edit display logic</Button>
        {pickedQuestion ? <Button type="button" variant="ghost" className="poll-logic-touch" onClick={() => onEditQuestion(pickedQuestion.name)}>Edit question</Button> : null}
      </div>
      <div className={cn("grid min-w-0 gap-3", desktop && "grid-cols-[minmax(0,1fr)_minmax(250px,300px)]")}>
        <div className="relative h-[clamp(290px,56dvh,620px)] min-w-0 overflow-hidden rounded-lg border bg-muted/30" aria-label="Poll logic map" role="region">
          <ReactFlow<MapNode, MapEdge>
            nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            nodeDragThreshold={5} paneClickDistance={5} nodesFocusable edgesFocusable autoPanOnNodeFocus ariaLabelConfig={ARIA}
            onInit={(flow) => { instance.current = flow; }} onNodesChange={move}
            onNodeClick={(_event, node) => selectTarget(node.id)} onEdgeClick={(_event, edge) => { if (!path) openEdge(edge); }}
            onEdgesChange={(changes) => {
              const selectedEdge = changes.find((change) => change.type === "select" && change.selected);
              const edge = selectedEdge?.type === "select" && edges.find((entry) => entry.id === selectedEdge.id);
              if (edge && !path) openEdge(edge);
            }}
            onBeforeDelete={({ edges: removed }) => {
              const dependency = removed[0]?.data?.dependency;
              if (dependency && !path) removeDependency(dependency);
              return Promise.resolve(false);
            }}
            nodesConnectable={!path} edgesReconnectable={false} connectionRadius={22}
            isValidConnection={(connection) => !validateConnection(connection)} onConnect={connect}
            onConnectStart={() => setConnectionNotice("")}
            onConnectEnd={(_event, connection) => {
              if (!connection.isValid && connection.fromNode && connection.toNode) {
                setConnectionNotice(validateConnection({
                  source: connection.fromNode.id, target: connection.toNode.id, targetHandle: connection.toHandle?.id ?? null
                }) ?? "");
              }
            }}
            defaultViewport={viewport} onMoveEnd={(_event, current) => onViewport(current)}
            fitView={!viewport} fitViewOptions={initialFit} minZoom={0.002} maxZoom={1.6}
            panOnDrag zoomOnPinch zoomOnScroll={false} zoomOnDoubleClick={false}
          >
            <Background gap={18} size={1.5} />
          </ReactFlow>
        </div>
        <aside aria-label="Logic details" className="poll-logic-panel flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-3">
          {desktop && editorOpen ? (
            <>
              <h3 ref={editorHeading} tabIndex={-1} className="text-base font-semibold wrap-anywhere outline-none">{editorTitle}</h3>
              {editor}
            </>
          ) : details ?? <p className="text-sm text-muted-foreground">Select a question or section to see its display logic.</p>}
        </aside>
      </div>
      {connectionNotice ? <p role="status" className="text-sm text-destructive">{connectionNotice}</p> : null}
      {!desktop ? (
        <Drawer open={editorOpen} onOpenChange={(open) => { if (!open) closeEditor(); }}>
          <DrawerContent keyboardAware finalFocus={() => focusReturn.current?.isConnected ? focusReturn.current : actionTrigger.current}>
            <DrawerHeader>
              <DrawerTitle className="wrap-anywhere">{editorTitle}</DrawerTitle>
              <DrawerDescription>Apply your changes to the draft.</DrawerDescription>
            </DrawerHeader>
            <div className="poll-logic-panel flex min-w-0 flex-col gap-3 px-4 pb-4">{editor}</div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
