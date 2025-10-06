import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type FileType = "json" | "txt" | "unknown";

type BlueprintState = {
  // Step 1 — Upload
  fileName?: string;
  fileType: FileType;
  rawText?: string;

  // Network (we’ll set walletNetwork later; user can override to chosenNetwork)
  walletNetwork?: "preprod" | "mainnet";
  chosenNetwork?: "preprod" | "mainnet";

  ingestFile: (file: File) => Promise<void>;
  clearUpload: () => void;
};

function detectFileType(name: string): FileType {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".txt")) return "txt";
  return "unknown";
}

export const useBlueprint = create<BlueprintState>()(
  devtools(
    persist(
      (set) => ({
        fileName: undefined,
        fileType: "unknown",
        rawText: undefined,
        walletNetwork: undefined,
        chosenNetwork: undefined,

        async ingestFile(file: File) {
          const text = await file.text();
          set({
            fileName: file.name,
            fileType: detectFileType(file.name),
            rawText: text,
          });
        },

        clearUpload() {
          set({ fileName: undefined, fileType: "unknown", rawText: undefined });
        },
      }),
      { name: "aiken-blueprint-wizard" }
    )
  )
);