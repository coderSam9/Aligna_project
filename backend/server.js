require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Posture = require("./db");
const app = express();

app.use((req, res, next) => {
  console.log("👉 Incoming request:", req.method, req.url);
  next();
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server alive");
});

app.post("/api/posture", async (req, res) => {
  console.log("Received Data:", req.body);
  try {
    await Posture.create(req.body);
    console.log("💾 Saved to MongoDB");
    res.json({ message: "Data received successfully" });
  } catch (err) {
    console.log("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/posture", async (req, res) => {
  try {
    const data = await Posture.find().sort({ _id: -1 }).limit(50);
    res.json(data);
  } catch (err) {
    console.log("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.get("/api/posture", async (req, res) => {
    try {
      const data = await Posture.find()
        .sort({ timestamp: -1 })
        .limit(50);
  
      res.json(data.reverse()); // oldest first for graphs
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

const PORT = 5050;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
