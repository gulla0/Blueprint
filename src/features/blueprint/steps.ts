import { useBlueprint } from "./state";

export type StepId = "upload" | "parse" | "params" | "artifacts" | "deploy" | "save";
export const StepOrder: StepId[] = ["upload", "parse", "params", "artifacts", "deploy", "save"];

export const StepMeta: Record<
  StepId,
  { title: string; canEnter?: () => boolean; canLeave?: () => boolean; isHidden?: () => boolean }
> = {
  upload: {
    title: "Upload",
    canLeave: () => {
      const s = useBlueprint.getState();
      return !!s.rawText && (s.fileType === "json" || s.fileType === "txt");
    },
  },
  parse: { title: "Parse" },
  params: { title: "Params", isHidden: () => false },   // we’ll flip based on parse next step
  artifacts: { title: "Artifacts" },
  deploy: { title: "Deploy", isHidden: () => false },   // optional; visible for now
  save: { title: "Save" },
};

export function isStepEnabled(target: StepId): boolean {
  const visible = !(StepMeta[target].isHidden?.() ?? false);
  if (!visible) return false;
  const idx = StepOrder.indexOf(target);
  for (let i = 0; i < idx; i++) {
    const s = StepOrder[i]!;
    if (StepMeta[s].isHidden?.()) continue;
    if (StepMeta[s].canLeave && !StepMeta[s].canLeave!()) return false;
  }
  return true;
}

export function nextStep(curr: StepId): StepId {
  const idx = StepOrder.indexOf(curr);
  for (let i = idx + 1; i < StepOrder.length; i++) {
    const s = StepOrder[i]!;
    if (!StepMeta[s].isHidden?.()) return s;
  }
  return curr;
}

export function prevStep(curr: StepId): StepId {
  const idx = StepOrder.indexOf(curr);
  for (let i = idx - 1; i >= 0; i--) {
    const s = StepOrder[i]!;
    if (!StepMeta[s].isHidden?.()) return s;
  }
  return curr;
}