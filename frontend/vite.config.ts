import path from "node:path";
import type { IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = process.env.VITE_PROXY_TARGET ?? "http://localhost:3001";
// Backend mounts API routes at the same prefixes the SPA uses (/campaigns, ...).
// Without this bypass, reloading on a SPA route would proxy the browser
// navigation to the backend and surface a raw 401 instead of the app shell.
const passThroughHtmlNavigations = (req: IncomingMessage) => {
  if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
    return "/index.html";
  }
};

const apiProxy = { target, bypass: passThroughHtmlNavigations };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/auth": apiProxy,
      "/campaigns": apiProxy,
      "/recipients": apiProxy,
      "/health": apiProxy,
    },
  },
});
