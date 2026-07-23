import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const rootDir = import.meta.dirname;
const distDir = resolve(rootDir, "dist");

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
        include: ["src"],
        rollupTypes: true,
        afterBuild: () => {
          copyFileSync(
            resolve(distDir, "index.d.ts"),
            resolve(distDir, "index.d.cts"),
          );
        },
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
