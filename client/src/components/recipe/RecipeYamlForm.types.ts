export interface RecipeYamlFormModsProps {
  disabled?: boolean;
  formDoc: Record<string, unknown>;
  modLines: string[];
  modsExists: boolean[] | null;
  patchDoc: (next: Record<string, unknown>) => void;
  setModLines: (next: string[]) => void;
}

export interface RecipeYamlFormDefaultsProps {
  disabled?: boolean;
  formDoc: Record<string, unknown>;
  defaultsError: string;
  setDefaultsError: (msg: string) => void;
  patchDoc: (next: Record<string, unknown>) => void;
  setScalar: (key: string, value: string | boolean | number) => void;
  defaultsRestText: string;
  defaultsObj: Record<string, unknown>;
  maxModelLenCurrent: number | undefined;
  maxBatchedCurrent: number | undefined;
  maxModelLenOpts: number[];
  maxBatchedOpts: number[];
}

export interface RecipeYamlFormProps {
  disabled?: boolean;
  formDoc: Record<string, unknown>;
  defaultsError: string;
  setDefaultsError: (msg: string) => void;
  modLines: string[];
  setModLines: (next: string[]) => void;
  modsExists: boolean[] | null;
  containerVal: string;
  containerSelectOptions: string[];
  containerImageOptionsLoading: boolean;
  containerImageOptionsErr: string | null;
  loadContainerImageOptions: () => Promise<void>;
  patchDoc: (next: Record<string, unknown>) => void;
  setScalar: (key: string, value: string | boolean | number) => void;
  applyRecipeVersionChange: (ver: string) => void;
  defaultsRestText: string;
  defaultsObj: Record<string, unknown>;
  maxModelLenCurrent: number | undefined;
  maxBatchedCurrent: number | undefined;
  maxModelLenOpts: number[];
  maxBatchedOpts: number[];
}
