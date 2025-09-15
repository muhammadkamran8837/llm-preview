"use client";

import * as React from "react";
import { parseLLMTextToSnackFiles } from "@/lib/parseLLMText";
import { withExpoSnackScaffold } from "@/lib/snackScaffold";

type Props = { llmText: string };
const SDK = "53.0.0";

export default function SnackRunner({ llmText }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [webUrl, setWebUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setWebUrl(null);

      if (!llmText.trim())
        throw new Error("Please paste or upload the LLM .txt first.");

      // 1) parse + scaffold → files
      const baseFiles = parseLLMTextToSnackFiles(llmText);
      const files = withExpoSnackScaffold(baseFiles);
      console.log("[SnackRunner] files:", Object.keys(files));

      // 2) only the extra libs your code uses
      const dependencies: Record<string, string> = {
        "expo-router": "~3.5.22",
        "@tanstack/react-query": "^5.51.0",
        "@nkzw/create-context-hook": "^1.1.0",
        "@react-native-async-storage/async-storage": "~1.23.1",
        "lucide-react-native": "^0.468.0",
      };

      // 3) POST payload → get public codeUrl (Vercel Blob)
      const r = await fetch("/api/snack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "LLM Preview",
          sdkVersion: SDK,
          dependencies,
          files,
        }),
      });
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
      const { codeUrl } = await r.json();

      // 4) build embed URL (single QR inside the iframe)
      const embedded = `https://snack.expo.dev/embedded?platform=web&preview=true&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        codeUrl
      )}`;

      setWebUrl(embedded);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [llmText]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Building…" : "Run Preview"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="min-h-[720px] w-full overflow-hidden rounded border">
        {webUrl ? (
          <iframe
            title="Snack Preview"
            src={webUrl}
            style={{ width: "100%", height: 720, border: 0 }}
            allow="camera; microphone; clipboard-read; clipboard-write; accelerometer; gyroscope"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Paste/upload your .txt and click “Run Preview”
          </div>
        )}
      </div>
    </div>
  );
}
