const mongoose = require("mongoose");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster-an.vpkvqaa.mongodb.net/?appName=Cluster-an`;

mongoose.connect(uri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

const postureSchema = new mongoose.Schema({
  deviceId: String,
  angle: Number,
  fatigueLevel: Number,
  postureStatus: String,
  timestamp: String
});

module.exports = mongoose.model("Posture", postureSchema);