import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for large context windows
  app.use(express.json({ limit: '50mb' }));

  // Proxy API route to bypass CORS
  app.post("/api/chat", async (req, res) => {
    try {
      const { url, key, model, messages, temperature } = req.body;
      
      let fetchUrl = url.trim();
      // Auto-append /chat/completions if the user only provided the base URL
      if (!fetchUrl.endsWith('/chat/completions') && !fetchUrl.endsWith('/completions')) {
        fetchUrl = fetchUrl.replace(/\/+$/, '') + '/chat/completions';
      }

      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
