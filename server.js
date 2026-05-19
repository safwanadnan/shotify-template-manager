import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const GADGET_ENV = process.env.GADGET_ENV || "development";
const GADGET_API_KEY = process.env.GADGET_API_KEY;

if (!GADGET_API_KEY) {
  console.error("Error: GADGET_API_KEY is not defined in the environment/env file.");
  process.exit(1);
}

const targetHost = GADGET_ENV === "production"
  ? "https://ai-images.gadget.app"
  : `https://ai-images--${GADGET_ENV}.gadget.app`;

// Proxy endpoint for GraphQL requests to Gadget
app.use(
  "/api/graphql",
  createProxyMiddleware({
    target: targetHost,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      // Inject the Gadget API key server-side
      proxyReq.setHeader("Authorization", `Bearer ${GADGET_API_KEY}`);
    },
  })
);

// Serve static assets from the build directory in production
app.use(express.static(path.join(__dirname, "dist")));

// Fallback for React SPA routing
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Proxy server is running on http://localhost:${PORT}`);
});
