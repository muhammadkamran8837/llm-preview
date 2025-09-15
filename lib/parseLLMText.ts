export type SnackFile = { type: "CODE" | "ASSET"; contents: string };
export type SnackFileMap = Record<string, SnackFile>;

type Segment = {
  path: string;
  start: number;
  end: number;
  isMerge?: boolean;
  kind?: "FILE" | "ASSET";
};

export function parseLLMTextToSnackFiles(raw: string): SnackFileMap {
  const files: SnackFileMap = {};

  // Normalize endings
  const s = raw.replace(/\r\n/g, "\n");

  // Header patterns we support:
  // 1) // path/to/file
  const reComment = /^\/\/\s+([^\n]+?)\s*$/gm;

  // 2) === FILE: path ===  (optional "(merge)"), and assets: === ASSET: path;mime=... ===
  const reBlock =
    /^===\s*(FILE|ASSET):\s*([^\n=]+?)(?:\s*\(merge\))?(?:;mime=[^\n]+)?\s*===\s*$/gm;

  // 3) Bare path line like: app/(tabs)/orders/_layout.tsx
  //    - starts at beginning, no spaces, contains a dot extension
  const reBare = /^(?:[A-Za-z0-9_@./()[\]-])+?\.[A-Za-z0-9]+$/gm;

  // Collect candidate headers with their index
  const markers: Array<{
    kind: "FILE" | "ASSET";
    path: string;
    idx: number;
    isMerge?: boolean;
  }> = [];

  // (1)
  for (const m of s.matchAll(reComment)) {
    markers.push({ kind: "FILE", path: m[1].trim(), idx: m.index ?? 0 });
  }

  // (2)
  for (const m of s.matchAll(reBlock)) {
    const whole = m[0] ?? "";
    markers.push({
      kind: (m[1] as "FILE" | "ASSET") ?? "FILE",
      path: (m[2] ?? "").trim(),
      idx: m.index ?? 0,
      isMerge: /\(merge\)/i.test(whole),
    });
  }

  // (3)
  for (const m of s.matchAll(reBare)) {
    // Exclude lines that already matched as comment or block headers (heuristic: unique idx)
    const idx = m.index ?? 0;
    // Avoid capturing lines that are inside code (we’ll still allow; worst case user gets extra split)
    markers.push({ kind: "FILE", path: (m[0] ?? "").trim(), idx });
  }

  // Deduplicate by (path, idx) and sort by idx
  const dedup = new Map<
    string,
    { kind: "FILE" | "ASSET"; path: string; idx: number; isMerge?: boolean }
  >();
  for (const m of markers) dedup.set(`${m.idx}::${m.path}`, m);
  const sorted = Array.from(dedup.values()).sort((a, b) => a.idx - b.idx);

  if (!sorted.length) {
    // Fallback: single file with whatever was pasted
    files["App.js"] = { type: "CODE", contents: s };
    return files;
  }

  // Build segments
  const segs: Segment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const nextIdx = i + 1 < sorted.length ? sorted[i + 1].idx : s.length;
    // For comment headers, body starts after that line’s newline
    const headerLineEnd = s.indexOf("\n", cur.idx);
    const start = headerLineEnd >= 0 ? headerLineEnd + 1 : cur.idx;
    segs.push({
      path: cur.path,
      start,
      end: nextIdx,
      isMerge: cur.isMerge,
      kind: cur.kind,
    });
  }

  // Emit files
  for (const seg of segs) {
    if (seg.path.startsWith("/") || seg.path.includes("..")) {
      throw new Error(`Illegal path in header: "${seg.path}"`);
    }
    const body = s.slice(seg.start, seg.end).replace(/^\s*\n/, "");
    const kind = seg.kind ?? "FILE";
    if (kind === "ASSET") {
      files[seg.path] = { type: "ASSET", contents: body.trim() }; // base64 expected
    } else {
      files[seg.path] = { type: "CODE", contents: body };
    }
  }

  // Helpful debug: list paths in console
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.log("[parseLLMTextToSnackFiles] files:", Object.keys(files));
  }

  return files;
}
