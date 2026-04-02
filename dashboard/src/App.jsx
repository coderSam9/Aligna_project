import React, { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import axios from "axios";
import SkeletonTwin from "./components/Twin";

function AlignaLogo() {
  return (
    <div style={styles.logoBox}>
      <div style={styles.logoIcon}>+</div>
      <div>
        <h2 style={{ marginBottom: 2, lineHeight: 1.2 }}>Aligna</h2>
        <p style={styles.subtitle}>Posture • Fatigue • Wellness</p>
      </div>
    </div>
  );
}

function TwinPage({ onBack }) {
  return (
    <div style={styles.twinPage}>
      <div style={styles.twinTopBar}>
        <AlignaLogo />
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
      </div>
      <div style={styles.twinBody}>
        <SkeletonTwin />
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [postureData, setPostureData] = useState([]);
  const [fatigueData, setFatigueData] = useState([]);
  const [metrics, setMetrics] = useState({ duration: "0m", goodPercent: 0, slouchTime: "0s", breaks: 0, avgAngle: 0 });
  const [isLive, setIsLive] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;
    const fetchData = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/posture`);
        setIsLive(true);
        const postureFormatted = res.data.map((item) => ({
          time: new Date(item.timestamp).toLocaleTimeString().slice(3, 8),
          neck: item.angle, back: Math.round(item.angle * 0.8),
        }));
        const fatigueFormatted = res.data.map((item) => ({
          time: new Date(item.timestamp).toLocaleTimeString().slice(3, 8),
          fatigue: Math.min(100, Math.round(item.fatigueLevel || 0))
        }));
        setPostureData(postureFormatted);
        setFatigueData(fatigueFormatted);
        const total = res.data.length;
        if (total === 0) return;
        const angles = res.data.map((d) => d.angle);
        const avg = angles.reduce((a, b) => a + b, 0) / total;
        const goodCount = angles.filter((a) => a < 30).length;
        const goodPercent = Math.round((goodCount / total) * 100);
        const badCount = total - goodCount;
        const slouchTime = `${Math.floor(badCount / 60)}m ${badCount % 60}s`;
        const first = new Date(res.data[0].timestamp);
        const last = new Date(res.data[total - 1].timestamp);
        const durationSec = Math.floor((last - first) / 1000);
        const duration = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;
        let breaks = 0;
        for (let i = 1; i < angles.length; i++) if (angles[i - 1] > 30 && angles[i] <= 30) breaks++;
        setMetrics({ duration, goodPercent, slouchTime, breaks, avgAngle: avg.toFixed(1) });
        if (avg > 35 || goodPercent < 60) { setShowAlert(true); setTimeout(() => setShowAlert(false), 4000); }
      } catch (err) {
        console.log("Fetch error:", err);
        setIsLive(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const distributionData = [
    { name: "Good",    value: postureData.filter((p) => p.neck < 20).length },
    { name: "Neutral", value: postureData.filter((p) => p.neck >= 20 && p.neck < 35).length },
    { name: "Slouch",  value: postureData.filter((p) => p.neck >= 35).length },
  ];
  const avgNeck = postureData.length ? postureData.reduce((a, b) => a + b.neck, 0) / postureData.length : 0;
  const strainData = [
    { name: "Neck",      value: Math.min(100, avgNeck * 1.8) },
    { name: "Shoulders", value: Math.min(100, avgNeck * 1.2) },
    { name: "Back",      value: Math.min(100, avgNeck * 0.8) },
    { name: "Wrists",    value: Math.min(100, avgNeck * 1.1) },
  ];

  if (page === "twin") return <TwinPage onBack={() => setPage("dashboard")} />;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <AlignaLogo />
        <div style={styles.buttons}>
          <button style={styles.liveBtn}  onClick={() => setIsRunning(true)}>Live Simulation</button>
          <button style={styles.pauseBtn} onClick={() => setIsRunning(false)}>Pause</button>
          <button style={styles.resetBtn} onClick={() => { setPostureData([]); setFatigueData([]);
            setMetrics({ duration: "0m", goodPercent: 0, slouchTime: "0s", breaks: 0, avgAngle: 0 }); }}>Reset</button>
          <button style={styles.twinBtn} onClick={() => setPage("twin")}>Digital Twin ↗</button>
          <div style={styles.liveIndicator}>
            <span style={{ ...styles.liveDot, background: isLive ? "#22c55e" : "#ef4444",
              boxShadow: isLive ? "0 0 10px #22c55e" : "0 0 10px #ef4444" }} />
            <span style={{ fontSize: 13 }}>{isLive ? "Live data streaming" : "Disconnected"}</span>
          </div>
        </div>
      </div>

      <div style={styles.cards}>
        <Card title="Session Duration" value={metrics.duration} />
        <Card title="Good Posture %"   value={metrics.goodPercent + "%"} />
        <Card title="Slouch Time"      value={metrics.slouchTime} />
        <Card title="Micro Breaks"     value={metrics.breaks} />
        <Card title="Avg Neck Angle"   value={metrics.avgAngle + "°"} />
      </div>

      <div style={styles.panels}>
        <div style={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div><h3>Posture Trend</h3><p style={{ color: "#94a3b8", fontSize: 13 }}>Neck vs Back angles over time</p></div>
            <div style={styles.badge}>Thresholds enabled</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={postureData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <ReferenceArea y1={-10} y2={10}  fill="#0f766e" fillOpacity={0.15} />
              <ReferenceArea y1={10}  y2={25}  fill="#facc15" fillOpacity={0.12} />
              <ReferenceArea y1={-25} y2={-10} fill="#facc15" fillOpacity={0.12} />
              <ReferenceArea y1={25}  y2={60}  fill="#dc2626" fillOpacity={0.12} />
              <ReferenceArea y1={-60} y2={-25} fill="#dc2626" fillOpacity={0.12} />
              <XAxis dataKey="time" stroke="#94a3b8" /><YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.1)" }} />
              <ReferenceLine y={10}  stroke="#facc15" strokeDasharray="4 4" />
              <ReferenceLine y={25}  stroke="#dc2626" strokeDasharray="4 4" />
              <ReferenceLine y={-10} stroke="#facc15" strokeDasharray="4 4" />
              <ReferenceLine y={-25} stroke="#dc2626" strokeDasharray="4 4" />
              <Legend />
              <Line type="monotone" dataKey="neck" name="Neck Angle (°)" stroke="#4ade80" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="back" name="Back Bend (°)"  stroke="#a78bfa" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div><h3>Fatigue Index</h3><p style={{ color: "#94a3b8", fontSize: 13 }}>0 (fresh) → 100 (fatigued)</p></div>
            <div style={styles.badge}>Modeled</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={fatigueData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <ReferenceArea y1={0}  y2={60}  fill="#0f766e" fillOpacity={0.12} />
              <ReferenceArea y1={60} y2={80}  fill="#facc15" fillOpacity={0.12} />
              <ReferenceArea y1={80} y2={100} fill="#dc2626" fillOpacity={0.12} />
              <XAxis dataKey="time" stroke="#94a3b8" /><YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#020617", border: "1px solid rgba(255,255,255,0.1)" }} />
              <ReferenceLine y={60} stroke="#facc15" strokeDasharray="4 4" />
              <ReferenceLine y={80} stroke="#dc2626" strokeDasharray="4 4" />
              <Legend />
              <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="#a78bfa" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={styles.analyticsRow}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div><h3>Posture Score</h3><p style={styles.sub}>Composite, higher is better</p></div>
            <div style={styles.badge}>Score: {metrics.goodPercent}</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: "score", value: metrics.goodPercent },{ name: "rest", value: 100 - metrics.goodPercent }]}
                startAngle={180} endAngle={0} innerRadius={70} outerRadius={90} dataKey="value">
                <Cell fill="#22c55e" /><Cell fill="#1e293b" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div><h3>Posture Distribution</h3><p style={styles.sub}>Good / Neutral / Slouch</p></div>
            <div style={styles.badge}>Rolling 10 min</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={distributionData} innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
                <Cell fill="#22c55e" /><Cell fill="#facc15" /><Cell fill="#ef4444" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <div><h3>Body Strain</h3><p style={styles.sub}>Relative load per region</p></div>
            <div style={styles.badge}>Model-based</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={strainData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#94a3b8" /><YAxis stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                <Cell fill="#22c55e" /><Cell fill="#a78bfa" /><Cell fill="#6366f1" /><Cell fill="#f59e0b" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...styles.panel, marginTop: 25 }}>
        <div style={styles.panelHeader}>
          <div><h3>Recommendations</h3><p style={styles.sub}>Proactive tips based on current signals</p></div>
          <div style={{ ...styles.badge,
            background: metrics.goodPercent < 60 ? "rgba(220,38,38,0.15)" : "rgba(34,197,94,0.15)",
            border: metrics.goodPercent < 60 ? "1px solid rgba(220,38,38,0.4)" : "1px solid rgba(34,197,94,0.4)",
            color:  metrics.goodPercent < 60 ? "#fecaca" : "#bbf7d0" }}>
            Status: {metrics.goodPercent < 60 ? "High fatigue" : "Stable"}
          </div>
        </div>
        <div style={styles.recommendationGrid}>
          <div style={{ ...styles.recCard, ...styles.recRed }}>
            <div style={styles.recDotRed} />
            <div><h4>Take a 3–5 minute micro-break</h4><p style={styles.recText}>Stand, walk, or do light stretches to lower fatigue.</p></div>
          </div>
          <div style={{ ...styles.recCard, ...styles.recPurple }}>
            <div style={styles.recDotPurple} />
            <div><h4>Realign posture</h4><p style={styles.recText}>Bring screen to eye level; engage core; feet flat.</p></div>
          </div>
          <div style={{ ...styles.recCard, ...styles.recYellow }}>
            <div style={styles.recDotYellow} />
            <div><h4>Ergonomics check</h4><p style={styles.recText}>Monitor height, chair lumbar support, desk distance.</p></div>
          </div>
        </div>
      </div>

      {showAlert && (
        <div style={styles.alertBox}>
          <div style={styles.alertIcon}>⚠</div>
          <div>
            <h4 style={{ margin: 0 }}>Posture Warning</h4>
            <p style={{ margin: 0, fontSize: 14 }}>Poor posture detected. Please realign your neck and shoulders.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

const styles = {
  page: { padding: "30px", maxWidth: "1300px", margin: "auto" },

  /* Twin page covers the ENTIRE viewport */
  twinPage: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    background: "#050a14",
    zIndex: 100,
    overflow: "hidden",
  },
  twinTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  /* Everything below the top bar — SkeletonTwin grows to fill it */
  twinBody: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },

  backBtn: { background: "transparent", border: "1px solid rgba(255,255,255,0.15)",
    color: "#94a3b8", padding: "10px 18px", borderRadius: "20px", cursor: "pointer", fontSize: "14px" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: "30px", paddingBottom: "15px", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  logoBox:  { display: "flex", alignItems: "center", gap: "14px" },
  logoIcon: { width: "46px", height: "46px", borderRadius: "14px",
    background: "linear-gradient(135deg,#38bdf8,#4ade80)", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "bold", flexShrink: 0 },
  subtitle: { color: "#94a3b8", fontSize: "14px", margin: 0 },
  buttons:  { display: "flex", gap: "10px", alignItems: "center" },
  liveBtn:  { background: "transparent", border: "1px solid #6ee7b7", color: "#6ee7b7", padding: "8px 14px", borderRadius: "20px", cursor: "pointer" },
  pauseBtn: { background: "#1e293b", border: "none", color: "#6ee7b7", padding: "8px 14px", borderRadius: "20px", cursor: "pointer" },
  resetBtn: { background: "#1e293b", border: "none", color: "#6ee7b7", padding: "8px 14px", borderRadius: "20px", cursor: "pointer" },
  twinBtn:  { background: "linear-gradient(135deg,#38bdf8,#4ade80)", border: "none", color: "#020617", padding: "8px 16px", borderRadius: "20px", cursor: "pointer", fontWeight: "600" },
  cards:    { display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" },
  card:     { background: "rgba(30,41,59,0.6)", backdropFilter: "blur(6px)", padding: "20px", borderRadius: "16px", width: "190px", border: "1px solid rgba(255,255,255,0.06)" },
  cardTitle:{ color: "#94a3b8", marginBottom: "10px", fontSize: "14px" },
  panels:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px" },
  analyticsRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "25px", marginTop: "25px" },
  panel:    { background: "rgba(30,41,59,0.6)", padding: "20px", borderRadius: "16px", minHeight: "280px", border: "1px solid rgba(255,255,255,0.06)" },
  badge:    { fontSize: 12, padding: "6px 12px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.1)", color: "#cbd5f5" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" },
  sub:      { color: "#94a3b8", fontSize: "13px" },
  recommendationGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "18px" },
  recCard:  { display: "flex", gap: "12px", padding: "18px", borderRadius: "14px", background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" },
  recText:  { color: "#cbd5f5", fontSize: "14px", marginTop: "6px" },
  recRed:    { border: "1px solid rgba(220,38,38,0.35)",  boxShadow: "0 0 0 1px rgba(220,38,38,0.15) inset" },
  recPurple: { border: "1px solid rgba(168,85,247,0.35)", boxShadow: "0 0 0 1px rgba(168,85,247,0.15) inset" },
  recYellow: { border: "1px solid rgba(234,179,8,0.35)",  boxShadow: "0 0 0 1px rgba(234,179,8,0.15) inset" },
  recDotRed:    { width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444", marginTop: "6px", flexShrink: 0 },
  recDotPurple: { width: "10px", height: "10px", borderRadius: "50%", background: "#a78bfa", marginTop: "6px", flexShrink: 0 },
  recDotYellow: { width: "10px", height: "10px", borderRadius: "50%", background: "#facc15", marginTop: "6px", flexShrink: 0 },
  liveIndicator: { display: "flex", alignItems: "center", gap: "8px", marginRight: "15px", color: "#cbd5f5" },
  liveDot:  { width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 },
  alertBox: { position: "fixed", bottom: "30px", right: "30px", background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(220,38,38,0.5)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
    padding: "18px 20px", borderRadius: "14px", display: "flex", gap: "12px", alignItems: "center", zIndex: 999 },
  alertIcon: { fontSize: "22px", color: "#ef4444" },
};
