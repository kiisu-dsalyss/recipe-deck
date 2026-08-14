import { useCallback, useEffect, useState } from "react";
import type { EditorSaveStatus } from "../components/recipe/EditorPanel";
import * as api from "../api/client";
import { applyBrokenToYaml } from "../lib/recipeDeckBroken";
import { RUNNER_API_SLOT } from "../../../types/index.js";
import type { useRecipeDeck } from "../hooks/useRecipeDeck";

type Deck = ReturnType<typeof useRecipeDeck>;

export function useAppRecipeEditor(deck: Deck, autoStartEnabled: boolean) {
  const p = deck.payload;
  const [stem, setStem] = useState("");
  const [yaml, setYaml] = useState("");
  const [baselineYaml, setBaselineYaml] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorSaveStatus, setEditorSaveStatus] = useState<EditorSaveStatus>("idle");
  const [deleteConfirmStem, setDeleteConfirmStem] = useState<string | null>(null);

  const onEditorStemChange = useCallback((s: string) => {
    setStem(s);
  }, []);

  /** Recipe `<select>` only (not editor keystrokes): clear log so old boot output does not look tied to the new recipe. */
  const onRunningStemChange = useCallback(
    (s: string) => {
      setStem(s);
      deck.clearRunLog();
    },
    [deck],
  );

  useEffect(() => {
    setEditorSaveStatus("idle");
  }, [stem]);

  useEffect(() => {
    if (editorSaveStatus !== "saved") {
      return;
    }
    const id = window.setTimeout(() => setEditorSaveStatus("idle"), 4500);
    return () => window.clearTimeout(id);
  }, [editorSaveStatus]);

  useEffect(() => {
    if (dirty) {
      setEditorSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
    }
  }, [dirty]);

  /** Stable when the set of recipe stems is unchanged; avoids refetching on periodic payload refresh. */
  const recipeStemsKey = (p?.recipes ?? [])
    .map((r) => r.stem)
    .slice()
    .sort()
    .join("|");

  useEffect(() => {
    const stemTrim = stem.trim();
    const recipes = p?.recipes ?? [];
    if (!stemTrim) {
      setYaml("");
      setBaselineYaml("");
      setDirty(false);
      return;
    }
    const exists = recipes.some((r) => r.stem === stemTrim);
    if (!exists) {
      setBaselineYaml("");
      setDirty(yaml !== "");
      return;
    }
    let cancelled = false;
    void api.fetchRecipe(stemTrim).then(
      (r) => {
        if (!cancelled) {
          setYaml(r.content);
          setBaselineYaml(r.content);
          setDirty(false);
        }
      },
      () => {
        if (!cancelled) {
          setYaml("");
          setBaselineYaml("");
          setDirty(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `yaml` is read only when stem / recipeStemsKey change (must not be a dep or every keystroke refetches).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem, recipeStemsKey]);

  const onYamlChange = useCallback((value: string) => {
    setYaml(value);
    setDirty(value !== baselineYaml);
  }, [baselineYaml]);

  const handleRunDisk = useCallback(async () => {
    if (!stem) return;
    deck.clearRunLog();
    try {
      await deck.run({
        slot: RUNNER_API_SLOT,
        recipeStem: stem,
        solo: true,
        useBuffer: false,
        autoStart: autoStartEnabled,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      window.alert(err.message ?? String(e));
    }
  }, [deck, stem, autoStartEnabled]);

  const handleRunBuffer = useCallback(async () => {
    if (!stem.trim()) return;
    deck.clearRunLog();
    try {
      await deck.run({
        slot: RUNNER_API_SLOT,
        recipeStem: stem.trim(),
        solo: true,
        useBuffer: true,
        yamlBuffer: yaml,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      window.alert(err.message ?? String(e));
    }
  }, [stem, deck, yaml]);

  const handleSaveFile = useCallback(async () => {
    if (!stem.trim()) return;
    setEditorSaveStatus("saving");
    try {
      await deck.saveRecipe(stem.trim(), yaml);
      setBaselineYaml(yaml);
      setDirty(false);
      setEditorSaveStatus("saved");
    } catch (e) {
      setEditorSaveStatus("error");
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, [stem, deck, yaml]);

  const handleRevert = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved edits?")) return;
    setYaml(baselineYaml);
    setDirty(false);
  }, [baselineYaml, dirty]);

  const handleRecipeBrokenChange = useCallback(
    async (broken: boolean) => {
      const s = stem.trim();
      if (!s) return;
      setEditorSaveStatus("saving");
      try {
        const merged = applyBrokenToYaml(yaml, broken);
        await deck.saveRecipe(s, merged);
        setYaml(merged);
        setBaselineYaml(merged);
        setDirty(false);
        setEditorSaveStatus("saved");
      } catch (e) {
        setEditorSaveStatus("error");
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [stem, deck, yaml],
  );

  const handleConfirmDeleteRecipe = useCallback(async () => {
    const s = deleteConfirmStem;
    setDeleteConfirmStem(null);
    if (!s) return;
    try {
      await deck.deleteRecipe(s);
      if (stem.trim() === s) {
        setStem("");
        setYaml("");
        setBaselineYaml("");
        setDirty(false);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }, [deleteConfirmStem, deck, stem]);

  return {
    stem,
    yaml,
    dirty,
    editorSaveStatus,
    deleteConfirmStem,
    setDeleteConfirmStem,
    onEditorStemChange,
    onRunningStemChange,
    onYamlChange,
    handleRunDisk,
    handleRunBuffer,
    handleSaveFile,
    handleRevert,
    handleRecipeBrokenChange,
    handleConfirmDeleteRecipe,
  };
}
