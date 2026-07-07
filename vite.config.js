import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = dirname(fileURLToPath(import.meta.url));

const legacyStaticFiles = [
  "styles.css",
  "shared.js",
  "app.js",
  "public.js",
  "config.js"
];

function copyLegacyStatic() {
  return {
    name: "copy-legacy-static",
    closeBundle() {
      const outDir = resolve("dist");
      mkdirSync(outDir, { recursive: true });

      legacyStaticFiles.forEach((file) => {
        if (existsSync(file)) {
          cpSync(file, resolve(outDir, file));
        }
      });

      if (existsSync("assets")) {
        cpSync("assets", resolve(outDir, "assets"), { recursive: true });
      }

      writeFileSync(resolve(outDir, ".nojekyll"), "");
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    copyLegacyStatic()
  ],
  build: {
    rollupOptions: {
      input: {
        admin: resolve(__dirname, "index.html"),
        public: resolve(__dirname, "public.html")
      }
    }
  }
});
