import Link from "next/link";
import {
  StepOrder,
  StepMeta,
  type StepId,
  isStepEnabled,
} from "../../blueprint/steps";
import { ChevronRight } from "lucide-react";

type Props = { current: StepId };

export function StepBar({ current }: Props) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {StepOrder.map((s, i) => {
        const enabled = isStepEnabled(s);
        const active = s === current;
        const hidden = StepMeta[s].isHidden?.() ?? false;
        if (hidden) return null;

        const bubbleBase =
          "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium transition";
        const bubbleClass = !enabled
          ? "bg-neutral-200 text-neutral-500 border-dashed cursor-not-allowed"
          : active
            ? "bg-indigo-200 border-indigo-500 text-black"
            : "bg-emerald-200 border-emerald-500 text-black";

        return (
          <div key={s} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <Link
                href={enabled ? `/blueprint/${s}` : "#"}
                aria-disabled={!enabled}
                className={`${bubbleBase} ${bubbleClass}`}
              >
                {i + 1}
              </Link>
              <div className={`mt-1 text-xs ${active ? "font-semibold" : ""}`}>
                {StepMeta[s].title}
              </div>
            </div>
            {i < StepOrder.length - 1 && (
              <ChevronRight className="h-4 w-4 opacity-60" />
            )}
          </div>
        );
      })}
    </div>
  );
}
