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

  const BASE = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;

  const run = React.useCallback(async () => {
    try {
      setBusy(true);
      setError(null);
      setWebUrl(null);

      if (!llmText.trim())
        throw new Error("Please paste or upload the LLM .txt first.");

      const baseFiles = parseLLMTextToSnackFiles(llmText);
      const files = withExpoSnackScaffold(baseFiles);

      const dependencies: Record<string, string> = {
        "expo-router": "~3.5.22",
        "@tanstack/react-query": "^5.51.0",
        "@nkzw/create-context-hook": "^1.1.0",
        "@react-native-async-storage/async-storage": "~1.23.1",
        "lucide-react-native": "^0.468.0",
      };

      const res = await fetch("/api/snack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "LLM Preview",
          sdkVersion: SDK,
          dependencies,
          files,
        }),
      });
      if (!res.ok) throw new Error(`Failed to stage code: ${res.status}`);
      const { id } = await res.json();

      // IMPORTANT: use your HTTPS base (ngrok/vercel), not http://localhost
      const codeUrl = `${BASE}/api/snack?id=${encodeURIComponent(id)}`;

      const embedded = `https://snack.expo.dev/embedded?platform=web&preview=true&sdkVersion=${encodeURIComponent(
        SDK
      )}&name=${encodeURIComponent("LLM Preview")}&codeUrl=${encodeURIComponent(
        codeUrl
      )}`;

      setWebUrl(embedded);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [llmText, BASE]);

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
