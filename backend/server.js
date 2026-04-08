require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// ── In-memory data store (no MongoDB needed) ────────────────────────
let postureData = [];

// ── Initialize Gemini AI ────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

app.use((req, res, next) => {
  console.log("👉 Incoming request:", req.method, req.url);
  next();
});

app.use(cors());
app.use(express.json());

// ── Posture Data Endpoints ──────────────────────────────────────────
app.post("/api/posture", async (req, res) => {
  console.log("Received Data:", req.body);
  try {
    postureData.push(req.body);
    if (postureData.length > 100) postureData.shift(); // keep last 100 entries
    console.log("💾 Saved to memory. Total records:", postureData.length);
    res.json({ message: "Data received successfully" });
  } catch (err) {
    console.log("Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/posture", async (req, res) => {
  try {
    res.json(postureData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Chat Endpoint ────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { message, metrics, history } = req.body;

    const latest = postureData.slice(-10);
    const avgAngle = latest.length
      ? (latest.reduce((sum, d) => sum + d.angle, 0) / latest.length).toFixed(1)
      : "N/A";
    const avgFatigue = latest.length
      ? (latest.reduce((sum, d) => sum + (d.fatigueLevel || 0), 0) / latest.length).toFixed(1)
      : "N/A";
    const lastStatus = latest.length ? latest[latest.length - 1].postureStatus : "unknown";

    const systemContext = `You are Aligna AI, a friendly and expert posture & ergonomics coach embedded inside the Aligna posture monitoring dashboard.

Current user posture data:
- Average Neck Angle (last 10 readings): ${avgAngle}° (good: <20°, warning: 20-35°, bad: >35°)
- Average Fatigue Level: ${avgFatigue}/100 (good: <50, warning: 50-70, bad: >70)
- Latest Posture Status: ${lastStatus}
- Session Good Posture %: ${metrics?.goodPercent ?? "N/A"}%
- Session Duration: ${metrics?.duration ?? "N/A"}
- Slouch Time: ${metrics?.slouchTime ?? "N/A"}
- Micro-breaks taken: ${metrics?.breaks ?? "N/A"}

Respond in a friendly, encouraging, actionable coach tone. Keep responses concise (2-4 sentences max) unless a detailed explanation is requested.`;

    const chatHistory = (history || []).map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemContext }] },
        { role: "model", parts: [{ text: "Understood! I'm Aligna AI, your posture coach. I have access to your live posture data and I'm ready to help you improve your ergonomics and wellbeing. What would you like to know?" }] },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(message);
    res.json({ reply: result.response.text() });
  } catch (err) {
    console.error("Gemini chat error:", err.message);
    // Fallback: smart rule-based reply
    const latest = postureData.slice(-5);
    const avgAngle = latest.length ? (latest.reduce((s, d) => s + d.angle, 0) / latest.length).toFixed(1) : 0;
    const avgFatigue = latest.length ? (latest.reduce((s, d) => s + (d.fatigueLevel || 0), 0) / latest.length).toFixed(1) : 0;

    let statusText = avgAngle > 35
      ? `Your neck angle is currently at ${avgAngle}° which is high. Try pulling your chin back and lifting your screen to eye level.`
      : avgFatigue > 70
        ? `Your fatigue level is at ${avgFatigue}/100 — time for a break! Stand up and do some shoulder rolls.`
        : `Your posture looks reasonable right now (${avgAngle}° neck angle, ${avgFatigue}/100 fatigue).`;

    const fallbackReply = ` "${req.body.message}". ${statusText}`;
    res.json({ reply: fallbackReply, fallback: true });
  }
});

// ── AI Insights Endpoint ────────────────────────────────────────────
app.post("/api/insights", async (req, res) => {
  const { metrics } = req.body;
  const latest = postureData.slice(-20);
  const avgAngle = latest.length
    ? (latest.reduce((sum, d) => sum + d.angle, 0) / latest.length).toFixed(1)
    : 0;
  const avgFatigue = latest.length
    ? (latest.reduce((sum, d) => sum + (d.fatigueLevel || 0), 0) / latest.length).toFixed(1)
    : 0;

  // By user request, we use the rule-based local algorithm for Insights
  // so that Gemini API tokens are strictly saved for Chatbot requests only.
  const insights = getRuleBasedInsights(avgAngle, avgFatigue, metrics);
  res.json({ insights, source: "rule-based" });
});

// ── Rule-based fallback insights ────────────────────────────────────
function getRuleBasedInsights(avgAngle, avgFatigue, metrics) {
  const angle = parseFloat(avgAngle);
  const fatigue = parseFloat(avgFatigue);
  const goodPct = metrics?.goodPercent ?? 0;
  const ins = [];

  if (fatigue > 70) {
    ins.push({ title: "High Fatigue Detected", desc: `Your fatigue is at ${fatigue}/100. Take an immediate 5-minute break — stand up, stretch your neck and shoulders.`, tone: "bad" });
  } else if (fatigue > 50) {
    ins.push({ title: "Moderate Fatigue Building", desc: `Fatigue at ${fatigue}/100. Do some neck rotations and shoulder shrugs to relieve tension.`, tone: "warn" });
  } else {
    ins.push({ title: "Energy Levels Good", desc: `Fatigue is at a healthy ${fatigue}/100. Keep up the great work and remember to take micro-breaks!`, tone: "good" });
  }

  if (angle > 35) {
    ins.push({ title: "Neck Angle Too High", desc: `Your neck is bent at ${angle}°. Raise your monitor to eye level and tuck your chin slightly to reduce neck strain.`, tone: "bad" });
  } else if (angle > 20) {
    ins.push({ title: "Slight Forward Head Posture", desc: `Neck angle is ${angle}°. Try adjusting your seat height or monitor distance to reduce the forward lean.`, tone: "warn" });
  } else {
    ins.push({ title: "Neck Alignment Excellent", desc: `Neck angle is ${angle}° — within the ideal range. Your screen height and distance appear well calibrated.`, tone: "good" });
  }

  if (goodPct < 50) {
    ins.push({ title: "Posture Consistency Needs Work", desc: `Only ${goodPct}% of your session was in good posture. Check your chair lumbar support, desk height, and take regular breaks.`, tone: "bad" });
  } else if (goodPct < 70) {
    ins.push({ title: "Posture Consistency Is Fair", desc: `${goodPct}% good posture this session. Try the 20-20-20 rule and set posture reminders every 20 minutes.`, tone: "warn" });
  } else {
    ins.push({ title: "Excellent Posture Consistency!", desc: `${goodPct}% of your session in good posture — fantastic! Keep alternating positions and maintaining that neutral spine.`, tone: "good" });
  }

  return ins;
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🤖 Gemini AI ${process.env.GEMINI_API_KEY ? "✅ configured" : "❌ missing API key"}`);
});
