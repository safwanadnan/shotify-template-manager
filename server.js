import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { AiImagesClient } from "@gadget-client/ai-images";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const GADGET_API_KEY = process.env.GADGET_API_KEY;
const GADGET_ENV = process.env.GADGET_ENV || "development";

if (!GADGET_API_KEY) {
  console.error("Error: GADGET_API_KEY is not defined in the environment/env file.");
  process.exit(1);
}

// Instantiate the Gadget client server-side only with the API Key
const api = new AiImagesClient({
  environment: GADGET_ENV,
  authenticationMode: {
    apiKey: GADGET_API_KEY,
  },
});

app.use(express.json());

// GET /api/templates
app.get("/api/templates", async (req, res) => {
  try {
    const search = req.query.search;
    const templates = await api.template.findMany({
      sort: { sortOrder: "Ascending" },
      search: search ? String(search) : undefined,
    });
    res.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

// POST /api/templates
app.post("/api/templates", async (req, res) => {
  try {
    const created = await api.template.create(req.body);
    res.json(created);
  } catch (error) {
    console.error("Error creating template:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

// PUT /api/templates/:id
app.put("/api/templates/:id", async (req, res) => {
  try {
    const updated = await api.template.update({
      id: req.params.id,
      ...req.body,
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating template:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

// DELETE /api/templates/:id
app.delete("/api/templates/:id", async (req, res) => {
  try {
    const result = await api.template.delete({
      id: req.params.id,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

// Serve static assets from the build directory in production
app.use(express.static(path.join(__dirname, "dist")));

// Fallback for React SPA routing
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Proxy server is running on http://localhost:${PORT}`);
});
