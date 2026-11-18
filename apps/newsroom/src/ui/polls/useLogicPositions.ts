"use client";

import { usePreferences } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ownerId, questionId } from "../../polls/engine/logic-map";
import { type SurveyDefinition } from "../../polls/engine/types";
import { normalizePositions, type Positions } from "./logic-positions";

export function useLogicPositions(id: number, enabled: boolean, { questions, groups }: SurveyDefinition) {
  const key = `poll-logic-layout:v1:${id}`;
  const preferences = usePreferences();
  const store = useRef(preferences);
  store.current = preferences;
  const [positions, setPositions] = useState<Positions>({});
  const current = useRef(positions);
  const touched = useRef(false);
  const loaded = useRef(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const validIds = useMemo(() => new Set([
    ...questions.map(({ name }) => questionId(name)), ...groups.map(({ name }) => ownerId({ kind: "section", name }))
  ]), [questions, groups]);
  const valid = useRef(validIds);
  valid.current = validIds;

  useEffect(() => {
    if (!enabled || loaded.current) return;
    let active = true;
    void store.current.getPreference<unknown>(key).then((stored) => {
      if (!active) return;
      loaded.current = true;
      if (touched.current) return;
      current.current = normalizePositions(stored, valid.current);
      setPositions(current.current);
    }).catch(() => { if (active) loaded.current = true; });
    return () => { active = false; };
  }, [enabled, key]);

  const update = useCallback((change: (positions: Positions) => Positions, persist = true) => {
    touched.current = true;
    const next = change(current.current);
    current.current = next;
    setPositions(next);
    if (persist) {
      // Separate from the draft save queue. A slow layout write cannot delay an edit.
      const bounded = normalizePositions(next, valid.current);
      writes.current = writes.current.then(() => store.current.setPreference(key, bounded)).catch(() => undefined);
    }
  }, [key]);

  return { positions, update };
}
