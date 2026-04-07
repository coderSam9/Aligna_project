import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";
import { PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import axios from "axios";
import SkeletonTwin, { socket } from "./components/Twin";
import AIRecommendationsChat from "./components/AIRecommendationsChat";

/* ─── brand gradient background ───────────────────────────────────── */
const brandGradient = {
  background: `
    radial-gradient(1200px 600px at 10% 5%,  rgba(88,28,135,0.18),   transparent 60%),
    radial-gradient(800px  400px at 90% 0%,   rgba(34,197,94,0.15),   transparent 50%),
    radial-gradient(700px  400px at 60% 100%, rgba(79,70,229,0.14),   transparent 60%),
    linear-gradient(180deg, #0B1220 0%, #0F172A 100%)
  `,
  minHeight: "100vh",
};

/* ─── Glow keyframe injected once ─────────────────────────────────── */
const glowStyle = `
  @keyframes pulseGlow {
    0%   { box-shadow: 0 0 0 0    rgba(34,197,94,0.4); }
    50%  { box-shadow: 0 0 30px 8px rgba(34,197,94,0.15); }
    100% { box-shadow: 0 0 0 0    rgba(34,197,94,0.4); }
  }
  .aligna-glow { animation: pulseGlow 2.5s ease-in-out infinite; }
  .aligna-divider {
    height: 1px;
    background: linear-gradient(90deg, rgba(148,163,184,0), rgba(148,163,184,0.25), rgba(148,163,184,0));
    margin: 16px 0;
  }
`;

function AlignaLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        className="aligna-glow"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "linear-gradient(135deg,#10b981,#8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12h16M12 4v16"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Aligna
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          Posture • Fatigue • Wellness
        </div>
      </div>
    </div>
  );
}

function TwinPage({ onBack, isManualMode, sandboxData, isRunning }) {
  return (
    <div style={{ ...styles.twinPage, ...brandGradient }}>
      <div style={{ ...styles.twinTopBar, position: "relative" }}>
        <AlignaLogo />
        {!isRunning && (
          <span style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            background: "rgba(148, 163, 184, 0.15)", border: "1px solid #94a3b8", borderRadius: 4, padding: "4px 12px",
            color: "#cbd5e1", fontSize: 12, fontWeight: "bold", letterSpacing: 2, fontFamily: "monospace",
            textShadow: "0 0 8px #94a3b8"
          }}>PAUSED</span>
        )}
        <button style={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
      </div>
      <div style={styles.twinBody}>
        <SkeletonTwin isManualMode={isManualMode} sandboxData={sandboxData} isRunning={isRunning} />
      </div>
      <footer style={{ ...styles.footer, textAlign: "center", maxWidth: "none", flexShrink: 0, zIndex: 10, background: "#020408" }}>
        Aligna • Simulated data for demo. Replace with your sensor/ML pipeline.
      </footer>
    </div>
  );
}

/* ─── Recommendation card (dynamic tone) ──────────────────────────── */
function RecCard({ title, desc, tone }) {
  const colors = {
    bad: {
      border: "rgba(239,68,68,0.3)",
      bg: "rgba(239,68,68,0.05)",
      dot: "#f87171",
    },
    warn: {
      border: "rgba(245,158,11,0.3)",
      bg: "rgba(245,158,11,0.05)",
      dot: "#fbbf24",
    },
    good: {
      border: "rgba(34,197,94,0.3)",
      bg: "rgba(34,197,94,0.05)",
      dot: "#4ade80",
    },
  };
  const c = colors[tone] ?? colors.good;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "16px 18px",
        borderRadius: 14,
        border: `1px solid ${c.border}`,
        background: c.bg,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: c.dot,
          marginTop: 6,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 5 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

/* ─── Status pill helper ───────────────────────────────────────────── */
function statusPillStyle(goodPercent, slouchStreak) {
  if (goodPercent < 60)
    return {
      background: "rgba(239,68,68,0.18)",
      color: "#fca5a5",
      border: "1px solid rgba(239,68,68,0.35)",
    };
  if (slouchStreak > 10)
    return {
      background: "rgba(245,158,11,0.18)",
      color: "#fde68a",
      border: "1px solid rgba(245,158,11,0.35)",
    };
  return {
    background: "rgba(34,197,94,0.18)",
    color: "#bbf7d0",
    border: "1px solid rgba(34,197,94,0.35)",
  };
}

function formatHMS(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

/* ─── Bar colors ───────────────────────────────────────────────────── */
const barColors = [
  "rgba(34,197,94,0.75)",
  "rgba(139,92,246,0.75)",
  "rgba(99,102,241,0.75)",
  "rgba(245,158,11,0.75)",
];

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [postureData, setPostureData] = useState([]);
  const [fatigueData, setFatigueData] = useState([]);
  const [metrics, setMetrics] = useState({
    duration: "0m",
    goodPercent: 0,
    slouchTime: "0s",
    breaks: 0,
    avgAngle: 0,
  });
  const [isLive, setIsLive] = useState(false);
  const [serverOk, setServerOk] = useState(false);
  const receiveTimeout = React.useRef(null);
  const [showAlert, setShowAlert] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [clockDisplay, setClockDisplay] = useState("00:00:00");
  const runningSince = React.useRef(Date.now());
  const elapsedMs = React.useRef(0);

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualDataStack, setManualDataStack] = useState([]);
  const [latestManualPoint, setLatestManualPoint] = useState(null);
  const latestLivePointRef = React.useRef(null);
  
  const [showModal, setShowModal] = useState(false);
  const playbackQueueRef = React.useRef([]);
  const playbackIntervalRef = React.useRef(null);
  const isRunningRef = React.useRef(isRunning);
  const liveDataBufferRef = React.useRef([]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  const resetSession = () => {
    setPostureData([]);
    setFatigueData([]);
    setMetrics({
      duration: "0m",
      goodPercent: 0,
      slouchTime: "0s",
      breaks: 0,
      avgAngle: 0,
    });
    elapsedMs.current = 0;
    runningSince.current = Date.now();
    setClockDisplay("00:00:00");
    
    // Hard clear the background buffers so data doesn't instantly violently respawn
    liveDataBufferRef.current = [];
    setManualDataStack([]);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsedData = JSON.parse(evt.target.result);
        if (Array.isArray(parsedData)) {
          playbackQueueRef.current = parsedData;
          alert(`Loaded ${parsedData.length} records. Ready to simulate.`);
        } else {
          alert('JSON must be an array of objects.');
        }
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const startPlayback = () => {
    if (playbackQueueRef.current.length === 0) {
      alert("No data loaded. Please upload a JSON file first.");
      return;
    }
    resetSession();
    setIsManualMode(true);
    setManualDataStack([]);
    setShowModal(false);
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    
    playbackIntervalRef.current = setInterval(() => {
      if (!isRunningRef.current) return; // Respect pause button

      if (playbackQueueRef.current.length === 0) {
        clearInterval(playbackIntervalRef.current);
        alert("Simulation Playback Complete!");
        return;
      }
      const nextPoint = playbackQueueRef.current.shift();
      setLatestManualPoint(nextPoint);
      setManualDataStack(prev => {
        const nextStack = [...prev, nextPoint].slice(-50);
        processData(nextStack);
        return nextStack;
      });
    }, 1000);
  };

  const stopPlayback = () => {
    if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    playbackQueueRef.current = [];
    setIsManualMode(false);
    setLatestManualPoint(null);
    setManualDataStack([]);
    setShowModal(false);
    resetSession();
  };

  const processData = (dataArray) => {
    if (dataArray.length === 0) return;
    const postureFormatted = dataArray.map((item) => ({
      time: new Date(item.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      neck: item.angle,
      back: Math.round(item.angle * 0.8),
    }));
    const fatigueFormatted = dataArray.map((item) => ({
      time: new Date(item.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      fatigue: Math.min(100, Math.round(item.fatigueLevel || 0)),
    }));
    setPostureData(postureFormatted);
    setFatigueData(fatigueFormatted);

    const total = dataArray.length;
    const angles = dataArray.map((d) => d.angle);
    const avg = angles.reduce((a, b) => a + b, 0) / total;
    const goodCount = angles.filter((a) => a < 30).length;
    const goodPercent = Math.round((goodCount / total) * 100);
    const badCount = total - goodCount;
    const slouchTime = `${Math.floor(badCount / 60)}m ${badCount % 60}s`;

    let duration = "0m 0s";
    if (total > 0) {
      const first = new Date(dataArray[0].timestamp);
      const last = new Date(dataArray[total - 1].timestamp);
      const durationSec = Math.floor((last - first) / 1000);
      duration = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;
    }

    let breaks = 0;
    for (let i = 1; i < angles.length; i++) {
      if (angles[i - 1] > 30 && angles[i] <= 30) breaks++;
    }

    setMetrics(prev => ({
      ...prev,
      duration,
      goodPercent,
      slouchTime,
      breaks,
      avgAngle: avg.toFixed(1),
    }));

    if (avg > 35 || goodPercent < 60) {
      setShowAlert(true);
      setTimeout(() => setShowAlert(false), 4000);
    }
  };

  /* ── NEW: hovered bar index for Body Strain ── */
  const [hoveredBar, setHoveredBar] = useState(null);

  /* ── live HH:MM:SS clock — purely display, resets with Reset button ── */
  useEffect(() => {
    if (!isRunning) return;
    runningSince.current = Date.now();
    const id = setInterval(() => {
      const currentRunTime = elapsedMs.current + (Date.now() - runningSince.current);
      setClockDisplay(formatHMS(currentRunTime));
    }, 1000);
    return () => {
      elapsedMs.current += Date.now() - runningSince.current;
      clearInterval(id);
    };
  }, [isRunning]);

  /* ── WebSocket Data Logic ── */
  const lastUpdateRef = React.useRef(0);

  useEffect(() => {
    const checkServer = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:5050";
        const res = await fetch(`${baseUrl}/api/posture`);
        setServerOk(res.ok);
      } catch (err) {
        setServerOk(false);
      }
    };
    checkServer();
    const interval = setInterval(checkServer, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isManualMode) return;

    const handlePose = (item) => {
      setIsLive(true);
      if (receiveTimeout.current) clearTimeout(receiveTimeout.current);
      receiveTimeout.current = setTimeout(() => {
        setIsLive(false);
      }, 2000);
      
      if (!isRunningRef.current) return;
      latestLivePointRef.current = item;

      // Structure the item roughly like the original API structure with a timestamp
      const frameData = {
        timestamp: Date.now(),
        angle: item.angle || 0,
        fatigueLevel: item.fatigueLevel || 0,
        postureStatus: item.postureStatus || "good"
      };

      liveDataBufferRef.current.push(frameData);
      if (liveDataBufferRef.current.length > 50) {
        liveDataBufferRef.current.shift();
      }

      // Throttle the dashboard UI updates to 500ms to preserve performance while appearing perfectly real-time
      const now = Date.now();
      if (now - lastUpdateRef.current >= 500) {
        processData([...liveDataBufferRef.current]);
        lastUpdateRef.current = now;
      }
    };

    socket.on("pose_data", handlePose);
    socket.on("connect", () => setServerOk(true));
    
    // Also mark dead connection if it disconnects
    const handleDisconnect = () => setIsLive(false);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("pose_data", handlePose);
      socket.off("connect");
      socket.off("disconnect", handleDisconnect);
    };
  }, [isManualMode]);

  let connectionState = "disconnected";
  if (isManualMode) connectionState = "sandbox";
  else if (serverOk && isLive) connectionState = "live";
  else if (serverOk && !isLive) connectionState = "waiting";
  else connectionState = "disconnected";
  
  const isWaiting = connectionState === "waiting" || connectionState === "disconnected";

  const statusProps = {
    sandbox: { text: "Sandbox mode", color: "#a855f7", dot: "#a855f7" },
    live: { text: "Live data streaming", color: "#22c55e", dot: "#22c55e" },
    waiting: { text: "Waiting for device", color: "#cbd5e1", dot: "#eab308" },
    disconnected: { text: "Disconnected", color: "#cbd5e1", dot: "#ef4444" }
  }[connectionState];

  /* ── original derived data — untouched ── */
  const distributionData = [
    { name: "Good", value: postureData.filter((p) => p.neck < 20).length },
    {
      name: "Neutral",
      value: postureData.filter((p) => p.neck >= 20 && p.neck < 35).length,
    },
    { name: "Slouch", value: postureData.filter((p) => p.neck >= 35).length },
  ];
  const avgNeck = postureData.length
    ? postureData.reduce((a, b) => a + b.neck, 0) / postureData.length
    : 0;
  const strainData = [
    { name: "Neck", value: Math.min(100, avgNeck * 1.8) },
    { name: "Shoulders", value: Math.min(100, avgNeck * 1.2) },
    { name: "Back", value: Math.min(100, avgNeck * 0.8) },
    { name: "Wrists", value: Math.min(100, avgNeck * 1.1) },
  ];

  /* ── dynamic recommendation content ── */
  const latestFatigue = fatigueData.length
    ? fatigueData[fatigueData.length - 1].fatigue
    : 0;
  const latestNeck = postureData.length
    ? postureData[postureData.length - 1].neck
    : 0;

  const rec1 =
    latestFatigue >= 70
      ? {
          title: "Take a 3–5 minute micro-break",
          desc: "Stand, walk, or do light stretches to lower fatigue.",
          tone: "bad",
        }
      : latestFatigue >= 50
      ? {
          title: "Short desk stretch",
          desc: "Neck rotations and shoulder rolls recommended now.",
          tone: "warn",
        }
      : {
          title: "You're doing great",
          desc: "Keep alternating positions; maintain neutral spine.",
          tone: "good",
        };

  const rec2 =
    Math.abs(latestNeck) > 25
      ? {
          title: "Realign posture",
          desc: "Bring screen to eye level; engage core; feet flat.",
          tone: "bad",
        }
      : Math.abs(latestNeck) > 10
      ? {
          title: "Slight posture tweak",
          desc: "Small chair or keyboard height adjustment could help.",
          tone: "warn",
        }
      : {
          title: "Neutral posture maintained",
          desc: "Neck angle is within desired range.",
          tone: "good",
        };

  const rec3 =
    metrics.goodPercent < 50
      ? {
          title: "Ergonomics check",
          desc: "Monitor height, chair lumbar support, desk distance.",
          tone: "warn",
        }
      : {
          title: "Maintain cadence",
          desc: "Follow 20-20-20 rule for eyes and posture resets.",
          tone: "good",
        };

  const statusText =
    latestFatigue > 70
      ? "High fatigue"
      : metrics.goodPercent < 60
      ? "Slouching"
      : "Stable";

  if (page === "twin") return <TwinPage onBack={() => setPage("dashboard")} isManualMode={isManualMode} sandboxData={isManualMode ? latestManualPoint : latestLivePointRef.current} isRunning={isRunning} />;

  return (
    <>
      <style>{glowStyle}</style>

      <div
        style={{
          ...brandGradient,
          color: "#f1f5f9",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* ── Header ── */}
        <header style={styles.header}>
          <div style={styles.headerInner}>
            <AlignaLogo />
            <div style={styles.headerRight}>
              <span
                style={{
                  ...styles.pill,
                  background: "rgba(30,41,59,0.8)",
                  border: "1px solid rgba(148,163,184,0.25)",
                  color: statusProps.color,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: statusProps.dot,
                    boxShadow: `0 0 8px ${statusProps.dot}`,
                    flexShrink: 0,
                  }}
                />
                {statusProps.text}
              </span>

              <button
                style={{
                  ...styles.pill,
                  background: isManualMode ? "rgba(30,41,59,0.8)" : "linear-gradient(135deg,#10b981,#8b5cf6)",
                  border: isManualMode ? "1px solid rgba(148,163,184,0.2)" : "none",
                  color: isManualMode ? "#94a3b8" : "#fff",
                }}
                onClick={stopPlayback}
              >
                📡 Live Device
              </button>
              <button
                style={{
                  ...styles.pill,
                  background: isManualMode || showModal ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "rgba(30,41,59,0.8)",
                  border: isManualMode || showModal ? "none" : "1px solid rgba(148,163,184,0.2)",
                  color: isManualMode || showModal ? "#fff" : "#94a3b8",
                }}
                onClick={() => setShowModal(true)}
              >
                🛠 Sandbox
              </button>
              
              <div style={{ width: 1, height: 24, background: "rgba(148,163,184,0.2)" }} />

              <button
                style={{
                  ...styles.pill,
                  ...(isRunning ? styles.btnOutline : styles.btnGradient)
                }}
                onClick={() => setIsRunning(true)}
              >
                {isRunning ? "Live Simulation" : "▶ Resume"}
              </button>
              <button
                style={{
                  ...styles.pill,
                  ...(!isRunning ? styles.btnOutline : styles.btnSlate),
                  opacity: !isRunning ? 0.7 : 1
                }}
                onClick={() => setIsRunning(false)}
                disabled={!isRunning}
              >
                {isRunning ? "Pause" : "Paused"}
              </button>
              <button
                style={{ ...styles.pill, ...styles.btnSlate }}
                onClick={resetSession}
              >
                Reset
              </button>
              <button
                style={{
                  ...styles.pill,
                  ...styles.btnGradient,
                  ...styles.twinBtn,
                }}
                onClick={() => setPage("twin")}
              >
                Digital Twin ↗
              </button>
            </div>
          </div>
        </header>

        <main style={styles.main}>


          {/* ── KPI Cards ── */}
          <div style={styles.kpiGrid}>
            <KpiCard
              label="Session Duration"
              value={clockDisplay}
              sub="Tracking live"
              subColor="#4ade80"
            />
            <KpiCard
              label="Good Posture"
              value={isWaiting ? "0%" : metrics.goodPercent + "%"}
              sub={
                metrics.goodPercent > 70
                  ? "Excellent"
                  : metrics.goodPercent > 50
                  ? "Fair"
                  : "Needs focus"
              }
              subColor={
                metrics.goodPercent > 70
                  ? "#4ade80"
                  : metrics.goodPercent > 50
                  ? "#fbbf24"
                  : "#f87171"
              }
            />
            <KpiCard
              label="Slouch Time"
              value={isWaiting ? "0m 0s" : metrics.slouchTime}
              sub="No streak"
              subColor="#f87171"
            />
            <KpiCard
              label="Micro-Breaks"
              value={isWaiting ? 0 : metrics.breaks}
              sub="Recommended every 30–40 min"
              subColor="#a78bfa"
            />
            <KpiCard
              label="Avg Neck Angle"
              value={isWaiting ? "0°" : metrics.avgAngle + "°"}
              sub="Target: −10° to +10°"
              subColor="#94a3b8"
            />
          </div>

          {/* ── Row 1: Posture Trend (wide) + Fatigue (narrow) ── */}
          <div style={styles.twoColWide}>
            <div style={{ ...styles.panel, flex: "0 0 calc(66% - 12px)" }}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelTitle}>Posture Trend</div>
                  <div style={styles.panelSub}>
                    Neck vs Back angles over time
                  </div>
                </div>
                <span style={styles.badge}>Thresholds enabled</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={isWaiting ? [] : postureData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <ReferenceArea
                    y1={-10}
                    y2={10}
                    fill="#0f766e"
                    fillOpacity={0.15}
                  />
                  <ReferenceArea
                    y1={10}
                    y2={25}
                    fill="#facc15"
                    fillOpacity={0.12}
                  />
                  <ReferenceArea
                    y1={-25}
                    y2={-10}
                    fill="#facc15"
                    fillOpacity={0.12}
                  />
                  <ReferenceArea
                    y1={25}
                    y2={60}
                    fill="#dc2626"
                    fillOpacity={0.12}
                  />
                  <ReferenceArea
                    y1={-60}
                    y2={-25}
                    fill="#dc2626"
                    fillOpacity={0.12}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                    }}
                  />
                  <ReferenceLine
                    y={10}
                    stroke="#facc15"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={25}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={-10}
                    stroke="#facc15"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={-25}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                  />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="neck"
                    name="Neck Angle (°)"
                    stroke="#4ade80"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="back"
                    name="Back Bend (°)"
                    stroke="#a78bfa"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...styles.panel, flex: "0 0 calc(34% - 12px)" }}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelTitle}>Fatigue Index</div>
                  <div style={styles.panelSub}>0 (fresh) → 100 (fatigued)</div>
                </div>
                <span style={styles.badge}>Modeled</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={isWaiting ? [] : fatigueData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <ReferenceArea
                    y1={0}
                    y2={60}
                    fill="#0f766e"
                    fillOpacity={0.12}
                  />
                  <ReferenceArea
                    y1={60}
                    y2={80}
                    fill="#facc15"
                    fillOpacity={0.12}
                  />
                  <ReferenceArea
                    y1={80}
                    y2={100}
                    fill="#dc2626"
                    fillOpacity={0.12}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                    }}
                  />
                  <ReferenceLine
                    y={60}
                    stroke="#facc15"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    y={80}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                  />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="fatigue"
                    name="Fatigue"
                    stroke="#a78bfa"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 2: Score Gauge + Distribution + Strain ── */}
          <div style={styles.threeCol}>
            {/* Posture Score gauge */}
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelTitle}>Posture Score</div>
                  <div style={styles.panelSub}>Composite, higher is better</div>
                </div>
                <span
                  style={{
                    ...styles.badge,
                    background:
                      metrics.goodPercent >= 70
                        ? "rgba(34,197,94,0.2)"
                        : metrics.goodPercent >= 50
                        ? "rgba(245,158,11,0.2)"
                        : "rgba(239,68,68,0.2)",
                    borderColor:
                      metrics.goodPercent >= 70
                        ? "rgba(34,197,94,0.4)"
                        : metrics.goodPercent >= 50
                        ? "rgba(245,158,11,0.4)"
                        : "rgba(239,68,68,0.4)",
                    color:
                      metrics.goodPercent >= 70
                        ? "#bbf7d0"
                        : metrics.goodPercent >= 50
                        ? "#fde68a"
                        : "#fecaca",
                  }}
                >
                  Score: {isWaiting ? 0 : metrics.goodPercent}
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: -15,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 380,
                  height: 240,
                }}
              >
                <HalfGauge value={isWaiting ? 0 : metrics.goodPercent} />
              </div>
            </div>

            {/* Distribution donut */}
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelTitle}>Posture Distribution</div>
                  <div style={styles.panelSub}>Good / Neutral / Slouch</div>
                </div>
                <span style={styles.badge}>Rolling 10 min</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={distributionData}
                    isAnimationActive={false}
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#facc15" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Body Strain bar*/}
            <div style={styles.panel}>
              <div style={styles.panelHeader}>
                <div>
                  <div style={styles.panelTitle}>Body Strain</div>
                  <div style={styles.panelSub}>Relative load per region</div>
                </div>
                <span style={styles.badge}>Model-based</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={strainData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                    domain={[0, 100]}
                  />
                  {/* kill default tooltip & cursor rectangle */}
                  <Tooltip content={() => null} cursor={false} />
                  <Bar
                    dataKey="value"
                    radius={[6, 6, 0, 0]}
                    cursor="default"
                    isAnimationActive={false}
                  >
                    {strainData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={barColors[index]}
                        opacity={
                          hoveredBar === index
                            ? 1
                            : hoveredBar === null
                            ? 0.8
                            : 0.2
                        }
                        onMouseEnter={() => setHoveredBar(index)}
                        onMouseLeave={() => setHoveredBar(null)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* custom hover label shown below chart */}
              <div style={{ height: 24, textAlign: "center", marginTop: 6 }}>
                {hoveredBar !== null && (
                  <span style={{ fontSize: 15, color: "#a5f3fc" }}>
                    {strainData[hoveredBar].name} — Strain:{" "}
                    <strong style={{ color: "#f1f5f9" }}>
                      {strainData[hoveredBar].value.toFixed(3)}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── AI Recommendations & Chat ── */}
          <div style={{ ...styles.panel, marginTop: 0 }}>
            <AIRecommendationsChat
              metrics={metrics}
              postureData={postureData}
              fatigueData={fatigueData}
              connectionState={connectionState}
            />
          </div>
        </main>

        <footer style={{ ...styles.footer, textAlign: "center" }}>
          Aligna • Simulated data for demo. Replace with your sensor/ML
          pipeline.
        </footer>

        {showAlert && (
          <div style={styles.alertBox}>
            <div style={{ fontSize: 22, color: "#ef4444" }}>⚠</div>
            <div>
              <div style={{ fontWeight: 600, margin: 0 }}>Posture Warning</div>
              <div style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
                Poor posture detected. Please realign your neck and shoulders.
              </div>
            </div>
          </div>
        )}

        {/* ── Modal Overlay ── */}
        {showModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{
              ...styles.panel, width: 480, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(245,158,11,0.5)',
              boxShadow: '0 0 50px rgba(245,158,11,0.15)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 18, color: '#fcd34d' }}>Data Playback Simulator</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Upload JSON history for interactive replay</div>
                </div>
                <button onClick={stopPlayback} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>✕</button>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>Select Array JSON File:</label>
                <input 
                  type="file" 
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{
                    width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(148,163,184,0.3)',
                    borderRadius: 8, color: '#94a3b8', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  onClick={startPlayback}
                  style={{ ...styles.pill, background: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff', flex: 1, padding: '10px 0', fontSize: 14 }}
                >
                  ▶ Start Simulation
                </button>
                <button 
                  onClick={stopPlayback}
                  style={{ ...styles.pill, background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', flex: 1, padding: '10px 0', fontSize: 14 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Half-circle SVG gauge ─────────────────────────────────────── */
function HalfGauge({ value }) {
  const color = value >= 70 ? "#22c55e" : value >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={[{ value }, { value: 100 - value }]}
            isAnimationActive={false}
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="65%"
            innerRadius={90}
            outerRadius={120}
            dataKey="value"
            strokeWidth={2}
            stroke="rgba(255,255,255,0.08)"
          >
            <Cell fill={color} />
            <Cell fill="rgba(148,163,184,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* number */}
      <div
        style={{
          position: "absolute",
          top: "64%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: 15, color: "#647499" }}>/ 100</div>
      </div>

      {/* labels */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "65%", // sits just under arc ends
          width: "68%",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "#647499", fontSize: 16 }}>0</span>
        <span style={{ color: "#647499", fontSize: 16 }}>100</span>
      </div>
    </div>
  );
}

/* ─── KPI Card ──────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, subColor }) {
  return (
    <div style={styles.kpiCard}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#94a3b8",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: subColor ?? "#94a3b8", marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */
const cardBase = {
  background: "rgba(17,24,39,0.7)",
  border: "1px solid rgba(148,163,184,0.15)",
  backdropFilter: "blur(8px)",
  boxShadow:
    "0 10px 30px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.03)",
  borderRadius: 16,
};

const styles = {
  twinPage: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
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
  twinBody: { flex: 1, display: "flex", overflow: "hidden" },
  backBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "#94a3b8",
    padding: "8px 18px",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14,
  },
  twinBtn: {
    background: "linear-gradient(135deg,#38bdf8,#4ade80)",
    border: "none",
    color: "#020617",
    padding: "8px 16px",
    borderRadius: "20px",
    cursor: "pointer",
    fontWeight: "600",
  },
  header: { borderBottom: "1px solid rgba(100,116,139,0.3)" },
  headerInner: {
    maxWidth: 1300,
    margin: "0 auto",
    padding: "18px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerRight: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  main: {
    maxWidth: 1300,
    margin: "0 auto",
    padding: "28px 28px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  footer: {
    borderTop: "1px solid rgba(100,116,139,0.25)",
    maxWidth: 1300,
    margin: "0 auto",
    padding: "16px 28px",
    fontSize: 12,
    color: "#475569",
    width: "100%",
  },
  pill: {
    borderRadius: 9999,
    padding: "6px 14px",
    fontSize: 13,
    lineHeight: "18px",
    cursor: "pointer",
    border: "none",
    fontWeight: 500,
  },
  btnOutline: {
    background: "transparent",
    border: "1px solid #6ee7b7",
    color: "#6ee7b7",
  },
  btnSlate: {
    background: "rgba(30,41,59,0.8)",
    color: "#94a3b8",
    border: "1px solid rgba(148,163,184,0.2)",
  },
  btnGradient: {
    background: "linear-gradient(135deg,#10b981,#8b5cf6)",
    color: "#fff",
    fontWeight: 700,
  },
  badge: {
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 9999,
    border: "1px solid rgba(148,163,184,0.25)",
    background:
      "linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))",
    color: "#cbd5e1",
    whiteSpace: "nowrap",
  },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 },
  kpiCard: { ...cardBase, padding: "18px 20px" },
  panel: { ...cardBase, padding: "20px 22px" },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  panelTitle: { fontWeight: 600, fontSize: 15, marginBottom: 2 },
  panelSub: { fontSize: 12, color: "#94a3b8" },
  twoColWide: { display: "flex", gap: 24 },
  threeCol: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 },
  alertBox: {
    position: "fixed",
    bottom: 30,
    right: 30,
    background: "rgba(15,23,42,0.97)",
    border: "1px solid rgba(220,38,38,0.5)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
    padding: "18px 20px",
    borderRadius: 14,
    display: "flex",
    gap: 12,
    alignItems: "center",
    zIndex: 999,
  },
};
