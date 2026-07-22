import { copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const rootDir = import.meta.dirname;
const distDir = resolve(rootDir, "dist");

function publishDeclarationFiles() {
  const candidates = [
    resolve(distDir, "src/index.d.ts"),
    resolve(distDir, "index.d.ts"),
    resolve(distDir, "extension-sdk.d.ts"),
  ];
  const source = candidates.find((path) => existsSync(path));
  if (!source) {
    return;
  }

  const namedDts = resolve(distDir, "extension-sdk.d.ts");
  const namedCts = resolve(distDir, "extension-sdk.d.cts");
  copyFileSync(source, namedDts);
  copyFileSync(source, namedCts);

  const nestedSrc = resolve(distDir, "src");
  if (existsSync(nestedSrc)) {
    rmSync(nestedSrc, { recursive: true, force: true });
  }
}

export default defineConfig(({ command }) => {
  const shared = {
    resolve: {
      alias: {
        "@kadanza/extension-sdk": resolve(rootDir, "src/index.ts"),
      },
    },
  };

  if (command === "serve") {
    return {
      ...shared,
      root: "playground",
      publicDir: resolve(rootDir, "public"),
    };
  }

  return {
    ...shared,
    plugins: [
      dts({
        tsconfigPath: "./tsconfig.lib.json",
        include: ["src/index.ts"],
        entryRoot: "src",
        insertTypesEntry: false,
        afterBuild: publishDeclarationFiles,
      }),
    ],
    build: {
      sourcemap: true,
      outDir: distDir,
      lib: {
        entry: resolve(rootDir, "src/index.ts"),
        formats: ["es", "cjs"],
        fileName: "extension-sdk",
      },
    },
  };
});
