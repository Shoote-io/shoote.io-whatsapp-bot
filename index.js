import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { runLLM } from "./ai.js";

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "API is running", timestamp: new Date().toISOString() });
});

// LLM Route
app.post("/api/ask", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim() === "") {
      return res.status(400).json({ error: "Prompt is required." });
    }

    // Call LLM
    const response = await runLLM(prompt);

    res.json({
      success: true,
      model: process.env.LLM_MODEL || "llama-3.1-70b-versatile",
      response,
    });
  } catch (error) {
    console.error("LLM Error:", error);

    // Handle specific Groq model decommission
    if (error?.message?.includes("decommissioned")) {
      return res.status(410).json({
        error: "Model decommissioned. Please update to a supported model.",
        details: error.message,
      });
    }

    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
