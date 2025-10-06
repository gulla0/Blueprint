import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  nextStep,
  prevStep,
  type StepId,
  StepMeta,
} from "../../blueprint/steps";

type Props = { current: StepId };

export function SideArrows({ current }: Props) {
  const left = prevStep(current);
  const right = nextStep(current);

  const canLeft = left !== current;
  const canRight = StepMeta[current].canLeave
    ? StepMeta[current].canLeave!()
    : true;

  return (
    <>
      <div className="fixed top-1/2 left-4 -translate-y-1/2">
        <Link
          href={canLeft ? `/blueprint/${left}` : "#"}
          aria-disabled={!canLeft}
          className={!canLeft ? "pointer-events-none opacity-40" : ""}
        >
          <ArrowLeft className="h-8 w-8" />
          <div className="mt-1 text-xs">previous</div>
        </Link>
      </div>

      <div className="fixed top-1/2 right-4 -translate-y-1/2">
        <Link
          href={canRight ? `/blueprint/${right}` : "#"}
          aria-disabled={!canRight}
          className={!canRight ? "pointer-events-none opacity-40" : ""}
        >
          <ArrowRight className="h-8 w-8" />
          <div className="mt-1 text-right text-xs">next</div>
        </Link>
      </div>
    </>
  );
}
