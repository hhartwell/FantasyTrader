import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = decodeURIComponent(new URL("..", import.meta.url).pathname);

const link = (href: string, label: string) =>
  `<a href="${href}" target="_blank" rel="noopener" style="color:#7dd3fc">${label}</a>`;

function attributionHtml(fantasyCalc: boolean) {
  const sleeper = link("https://sleeper.com", "Sleeper");
  const yahoo = link("https://football.fantasysports.yahoo.com", "Yahoo Fantasy");
  if (!fantasyCalc) return `Player values from ${sleeper} or ${yahoo}`;
  return `Player values from ${link("https://fantasycalc.com", "FantasyCalc.com")}, ${sleeper}, or ${yahoo}`;
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, repoRoot, "");
  const fantasyCalcEnabled = (process.env.FANTASYCALC_ENABLED ?? fileEnv.FANTASYCALC_ENABLED) === "true";
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "value-attribution",
        transformIndexHtml(html: string) {
          return html.replace(
            /<footer id="static-attribution"[\s\S]*?<\/footer>/,
            `<footer id="static-attribution" style="text-align:center;font-size:12px;padding:8px 8px 88px;color:#94a3b8">${attributionHtml(fantasyCalcEnabled)}</footer>`,
          );
        },
      },
    ],
    define: {
      "import.meta.env.VITE_FANTASYCALC_ENABLED": JSON.stringify(fantasyCalcEnabled ? "true" : "false"),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": process.env.API_TARGET ?? "http://localhost:3001",
      },
    },
  };
});
