import { copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const rootDir = import.meta.dirname;
const distDir = resolve(rootDir, "dist");
const packageName = JSON.parse(
  readFileSync(resolve(rootDir, "package.json"), "utf8"),
).name;

export default defineConfig(({ command }) => {
  const shared = {
    define: {
      __PACKAGE_NAME__: JSON.stringify(packageName),
    },
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
      plugins: [basicSsl()],
      server: {
        port: 5000,
        strictPort: true,
      },
      preview: {
        port: 5000,
        strictPort: true,
      },
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
