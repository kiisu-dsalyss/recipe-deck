export interface RecipeYamlDualEditorProps {
  content: string;
  onContentChange: (value: string) => void;
  disabled?: boolean;
  /** When true (and form mode), each mods line is checked on the server under $SPARK_VLLM_ROOT/mods */
  modsValidationEnabled?: boolean;
}
