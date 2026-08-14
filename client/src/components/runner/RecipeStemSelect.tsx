import type { ReactElement } from "react";
import { GlassSelect } from "../ui/GlassSelect.js";
import { recipeBookGroups } from "./runningModelPanelUtils.js";
import type { RecipeStemSelectProps } from "./RecipeStemSelect.types.js";

export function RecipeStemSelect(props: RecipeStemSelectProps): ReactElement {
  const { id, recipes, value, onChange, editable, placeholder, includeEmpty, title } = props;
  const groups = recipeBookGroups(recipes).map((g) => {
    const folder = g.label === "(root)" ? "" : `${g.label}/`;
    return {
      label: g.label,
      items: g.items.map((r) => {
        const short =
          folder && r.stem.startsWith(folder) ? r.stem.slice(folder.length) : r.stem;
        return {
          value: r.stem,
          label: `${r.broken ? "⚠ " : ""}${short}`,
          danger: Boolean(r.broken),
        };
      }),
    };
  });
  return (
    <GlassSelect
      id={id}
      layout="grow"
      value={value}
      onChange={onChange}
      groups={groups}
      editable={editable}
      placeholder={placeholder}
      includeEmpty={includeEmpty}
      title={title}
    />
  );
}
