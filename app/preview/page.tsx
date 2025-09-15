"use client";

import React from "react";
import SnackRunner from "@/components/SnackRunner";

export default function PreviewPage() {
  const [txt, setTxt] = React.useState<string>("");
  const [fileName, setFileName] = React.useState<string>("");

  const onFile = async (f: File) => {
    const raw = await f.text();
    setTxt(raw);
    setFileName(f.name);
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">
        Expo Preview (LLM .txt → Snack)
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        Paste your LLM output (the one that contains code blocks with path
        headers), or drop a .txt file.
      </p>

      <div className="mt-6 grid gap-4">
        <div className="flex items-center gap-3">
          <label className="rounded border px-3 py-2 cursor-pointer">
            <input
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            Upload .txt
          </label>
          {fileName && (
            <span className="text-sm text-gray-500">{fileName}</span>
          )}
        </div>

        <textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="// app/index.tsx\nexport default function Screen(){ return null }"
          className="min-h-[220px] w-full resize-vertical rounded border p-3 font-mono text-sm"
        />

        <SnackRunner llmText={txt} />
      </div>
    </div>
  );
}
