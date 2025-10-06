import * as React from "react";
import { useBlueprint } from "../../blueprint/state";
import { Button } from "~/components/Button";
import { Plus } from "lucide-react"; // ✅ import from lucide-react

export function UploadBlueprint() {
  const { fileName, rawText, ingestFile, clearUpload } = useBlueprint();
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files?: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await ingestFile(file);
  }

  const onChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    await handleFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    await handleFiles(e.dataTransfer.files);
  };

  const onDrag: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const uploaded = !!rawText;

  return (
    <div className="space-y-4">
      {uploaded ? (
        // ---- Uploaded state ----
        <div className="rounded border p-3 text-sm">
          <div className="mt-1">
            <strong>File:</strong> {fileName}
          </div>
          <div className="text-md mt-2 font-bold">
            Preview{" "}
            <span className="text-sm font-normal text-gray-500">
              (up to 600 characters)
            </span>
          </div>
          <div className="mb-4">
            <pre className="mt-2 mb-2 max-h-48 overflow-auto rounded bg-neutral-100 p-2 text-xs break-words whitespace-pre-wrap">
              {rawText.slice(0, 600)}
              {rawText.length > 600 ? " …" : ""}
            </pre>
          </div>
          <Button onClick={clearUpload} className="mt-3">
            Clear
          </Button>
        </div>
      ) : (
        // ---- Not uploaded: Clickable + drag-drop box ----
        <div className="w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            onChange={onChange}
            className="hidden"
          />

          <div
            role="button"
            tabIndex={0}
            onClick={openFilePicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openFilePicker();
            }}
            onDragEnter={onDrag}
            onDragOver={onDrag}
            onDragLeave={onDrag}
            onDrop={onDrop}
            className={[
              "relative mx-auto rounded-2xl border",
              "border-neutral-300 bg-neutral-100",
              "transition-shadow",
              dragActive ? "shadow-md ring-2 ring-neutral-400" : "shadow-none",
              "h-[420px] max-w-5xl",
              "flex cursor-pointer items-center justify-center text-center select-none",
            ].join(" ")}
          >
            <div className="space-y-4">
              {/* ✅ Lucide icon */}
              <Plus
                className="mx-auto h-10 w-10 text-neutral-500"
                strokeWidth={2}
              />

              <div className="text-base font-medium text-neutral-500">
                Upload your Aiken Blueprint (.json or .txt)
              </div>

              <div className="text-xs text-neutral-400">
                Click anywhere or drag & drop a file
              </div>
            </div>

            <span className="absolute inset-0" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
