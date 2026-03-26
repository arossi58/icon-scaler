import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const ICON_DIRS = {
  lucide: "node_modules/lucide-static/icons",
  phosphor: "node_modules/@phosphor-icons/core/assets/regular",
  heroicons: "node_modules/heroicons/24/outline",
};

function iconPlugin() {
  const virtualId = "virtual:icon-lists";
  const resolvedId = "\0" + virtualId;

  return {
    name: "icon-plugin",

    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },

    load(id) {
      if (id === resolvedId) {
        const readNames = (dir) => {
          try {
            return fs
              .readdirSync(path.resolve(dir))
              .filter((f) => f.endsWith(".svg"))
              .map((f) => f.replace(/\.svg$/, ""))
              .sort();
          } catch {
            return [];
          }
        };
        const lists = Object.fromEntries(
          Object.entries(ICON_DIRS).map(([k, dir]) => [k, readNames(dir)])
        );
        return `export default ${JSON.stringify(lists)};`;
      }
    },

    // Serve SVGs from node_modules in dev
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/icons\/(lucide|phosphor|heroicons)\/([^/?]+\.svg)$/);
        if (!m) return next();
        const [, lib, file] = m;
        const filePath = path.resolve(ICON_DIRS[lib], file);
        if (!fs.existsSync(filePath)) return next();
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.end(fs.readFileSync(filePath));
      });
    },

    // Copy SVGs to dist for production
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      for (const [lib, dir] of Object.entries(ICON_DIRS)) {
        const src = path.resolve(dir);
        const dest = path.join(outDir, "icons", lib);
        try {
          fs.mkdirSync(dest, { recursive: true });
          for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".svg"))) {
            fs.copyFileSync(path.join(src, f), path.join(dest, f));
          }
        } catch (e) {
          console.warn(`icon-plugin: failed to copy ${lib}:`, e.message);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), iconPlugin()],
});
