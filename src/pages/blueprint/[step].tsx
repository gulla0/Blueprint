import { useRouter } from "next/router";
import Head from "next/head";
import { StepBar } from "../../features/blueprint/components/StepBar";
import { SideArrows } from "../../features/blueprint/components/SideArrows";
import { UploadBlueprint } from "../../features/blueprint/components/UploadBlueprint";
import { StepMeta, type StepId } from "../../features/blueprint/steps";

export default function BlueprintStepPage() {
  const router = useRouter();
  const step = (router.query.step as StepId) || "upload";
  const meta = StepMeta[step];
  const canContinue = meta?.canLeave ? meta.canLeave() : true;

  return (
    <>
      <Head>
        <title>Aiken Blueprint • {meta?.title ?? "Wizard"}</title>
      </Head>

      <div className="min-h-screen">
        <div className="sticky top-20 z-10 border-b bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4">
            <StepBar current={step} />
          </div>
        </div>

        <SideArrows current={step} />

        <main className="mx-auto mt-20 max-w-3xl px-4 py-6">
          {step === "upload" && <UploadBlueprint />}

          {step !== "upload" && (
            <div className="rounded border p-4 text-sm">
              This step will be wired next. Go to <code>/blueprint/upload</code>{" "}
              to start.
            </div>
          )}
        </main>
      </div>
    </>
  );
}
