// --------------------------------------------
// 🌿 AgroMind Backend - Plant Disease Detection (Plant.id v3)
// --------------------------------------------

import express from "express";
import cors from "cors";
import fs from "fs";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ dest: "tmp/" });

// ✅ Health check route
app.get("/", (req, res) => {
  res.json({
    message: "🌿 AgroMind Backend Running Successfully",
    api: "Plant.id v3 - Disease Detection",
    usage: "POST /api/detect with image file",
  });
});

// ✅ Main detection route
app.post("/api/detect", upload.single("image"), async (req, res) => {
  try {
    const PLANT_API = process.env.CROP_HEALTH_API_KEY;

    if (!PLANT_API) return res.status(400).json({ error: "Missing Plant.id API key" });
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const imgBase64 = fs.readFileSync(req.file.path, { encoding: "base64" });
    fs.unlinkSync(req.file.path);

    console.log("🌿 Sending image to Plant.id...");

    const plantResponse = await axios.post(
      "https://plant.id/api/v3/health_assessment",
      {
        images: [imgBase64],
        health: "auto",
        similar_images: true,
        classification_level: "species",
      },
      {
        headers: {
          "Api-Key": PLANT_API,
          "Content-Type": "application/json",
        },
      }
    );

    const result = plantResponse.data?.result;
    const diseaseSuggestions = result?.disease?.suggestions;

    if (!diseaseSuggestions || diseaseSuggestions.length === 0) {
      return res.json({
        success: true,
        healthy: true,
        message: "✅ Plant appears healthy!",
      });
    }

    const disease = diseaseSuggestions[0];
    const diseaseName = disease.name || "Unknown Disease";
    const probability = ((disease.probability || 0) * 100).toFixed(2);

    const description =
      disease.details?.description || "No description available.";
    const treatment =
      disease.details?.treatment?.join(", ") ||
      "No treatment information available.";

    console.log(`🌿 Detected: ${diseaseName} (${probability}%)`);

    res.json({
      success: true,
      healthy: false,
      disease: diseaseName,
      probability,
      description,
      treatment,
    });
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ 404 fallback
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// ✅ Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`✅ AgroMind backend running at http://localhost:${PORT}`)
);
