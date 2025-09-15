import type { SnackFileMap } from "./parseLLMText";

/**
 * Files Snack needs to reliably boot your RN app on web/phone.
 * We no longer add package.json as a file — Snack ignores it for deps.
 * Instead, expose deps via getSnackDependencies() below.
 */
export function withExpoSnackScaffold(files: SnackFileMap): SnackFileMap {
  const out: SnackFileMap = { ...files };

  // 1) Device-safe entry: some devices still want App.js present
  out["App.js"] = out["App.js"] || {
    type: "CODE",
    contents: `export { default } from "expo-router/entry";`,
  };

  // 2) Minimal router structure so something renders even if LLM missed a page
  if (!out["app/_layout.tsx"]) {
    out["app/_layout.tsx"] = {
      type: "CODE",
      contents: `
import { Stack } from "expo-router";
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
`.trim(),
    };
  }

  if (!out["app/index.tsx"]) {
    out["app/index.tsx"] = {
      type: "CODE",
      contents: `
import { View, Text } from "react-native";
export default function Home() {
  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", backgroundColor:"#fff" }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>✅ Expo Router is running</Text>
      <Text style={{ marginTop: 8, fontSize: 14, opacity: 0.7 }}>
        Replace this with your own app/index.tsx
      </Text>
    </View>
  );
}
`.trim(),
    };
  }

  // 3) TS + Babel (for "@/..." imports)
  out["tsconfig.json"] = out["tsconfig.json"] || {
    type: "CODE",
    contents: JSON.stringify(
      {
        compilerOptions: {
          target: "esnext",
          module: "esnext",
          jsx: "react-jsx",
          strict: true,
          baseUrl: ".",
          paths: { "@/*": ["./*"] },
        },
      },
      null,
      2
    ),
  };

  out["babel.config.js"] = out["babel.config.js"] || {
    type: "CODE",
    contents: `
module.exports = function(api){
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      require.resolve("expo-router/babel"),
      ["module-resolver", { alias: { "@": "." } }]
    ],
  };
};
`.trim(),
  };

  // Do NOT add package.json or app.json as files here; Snack installs deps from the SDK 'dependencies' map.
  return out;
}

/**
 * Dependencies Snack must install (SDK-specific). Keep this minimal and
 * list only the libraries your LLM code imports in most apps.
 */
export function getSnackDependencies() {
  return {
    // Expo core deps are auto-picked by Snack from sdkVersion
    "expo-router": "~3.5.22",
    "@tanstack/react-query": "^5.51.0",
    "@nkzw/create-context-hook": "^1.1.0",
    "@react-native-async-storage/async-storage": "~1.23.1",
    "lucide-react-native": "^0.468.0",
  };
}
