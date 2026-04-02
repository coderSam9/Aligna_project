const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

const postureSchema = new mongoose.Schema({
  deviceId: String,
  angle: Number,
  fatigueLevel: Number,
  postureStatus: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Posture", postureSchema);