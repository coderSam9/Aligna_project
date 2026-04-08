import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5050";

/* ── Tone colour map ─────────────────────────────────────────────── */
const toneColors = {
  bad:  { border: "rgba(239,68,68,0.35)",  bg: "rgba(239,68,68,0.08)",  dot: "#f87171", label: "#fca5a5" },
  warn: { border: "rgba(245,158,11,0.35)", bg: "rgba(245,158,11,0.08)", dot: "#fbbf24", label: "#fde68a" },
  good: { border: "rgba(34,197,94,0.35)",  bg: "rgba(34,197,94,0.08)",  dot: "#4ade80", label: "#bbf7d0" },
};

/* ── Insight Card ────────────────────────────────────────────────── */
function InsightCard({ title, desc, tone, index }) {
  const c = toneColors[tone] ?? toneColors.good;
  const icons = { bad: "🚨", warn: "⚠️", good: "✅" };
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "16px 18px",
        borderRadius: 14,
        border: `1px solid ${c.border}`,
        background: c.bg,
        animation: `fadeSlideIn 0.4s ease ${index * 0.12}s both`,
      }}
    >
      <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{icons[tone] ?? "✅"}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: c.label, marginBottom: 5 }}>{title}</div>
        <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ── Chat Bubble ─────────────────────────────────────────────────── */
function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
        animation: "fadeSlideIn 0.25s ease both",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#10b981,#8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
            marginRight: 8,
            marginTop: 2,
          }}
        >
          🤖
        </div>
      )}
      <div
        style={{
          maxWidth: "78%",
          padding: "10px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser
            ? "linear-gradient(135deg,#10b981,#059669)"
            : "rgba(30,41,59,0.9)",
          border: isUser ? "none" : "1px solid rgba(148,163,184,0.15)",
          color: isUser ? "#fff" : "#e2e8f0",
          fontSize: 13.5,
          lineHeight: 1.6,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

/* ── Typing Indicator ────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <div
        style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(135deg,#10b981,#8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}
      >🤖</div>
      <div
        style={{
          padding: "10px 16px",
          borderRadius: "16px 16px 16px 4px",
          background: "rgba(30,41,59,0.9)",
          border: "1px solid rgba(148,163,184,0.15)",
          display: "flex", gap: 4, alignItems: "center",
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#4ade80",
              animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Suggested Prompts ───────────────────────────────────────────── */
const SUGGESTED = [
  "How is my posture right now?",
  "Why do I feel shoulder pain?",
  "When should I take a break?",
  "How can I improve my setup?",
];

/* ── Main Component ──────────────────────────────────────────────── */
export default function AIRecommendationsChat({ metrics, postureData, fatigueData, connectionState }) {
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);
  const [lastInsightTime, setLastInsightTime] = useState(null);

  const [messages, setMessages] = useState([
    {
      role: "model",
      content: "Hi! I'm Aligna AI 🧠 — your personal posture coach. I can see your live posture data and I'm here to help. Ask me anything about your posture, fatigue, or ergonomics!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isChatLoading]);

  /* ── Fetch insights every 60s ── */
  const fetchInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await axios.post(`${API_URL}/api/insights`, { metrics });
      setInsights(res.data.insights || []);
      setLastInsightTime(new Date().toLocaleTimeString());
    } catch (err) {
      setInsightsError("Could not fetch AI insights. Make sure the backend is running.");
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    const id = setInterval(fetchInsights, 60000);
    return () => clearInterval(id);
  }, []); // Only refresh on mount and every 60s via the interval

  /* ── Send chat message ── */
  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;

    const history = messages.filter((m) => m.role !== "model" || messages.indexOf(m) > 0);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsChatLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: userMsg,
        metrics,
        history: history.slice(-8), // last 8 messages for context
      });
      setMessages((prev) => [...prev, { role: "model", content: res.data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: "⚠️ Sorry, I couldn't connect to the AI server. Please check the backend is running." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── Status badge ── */
  const latestFatigue = fatigueData?.length ? fatigueData[fatigueData.length - 1].fatigue : 0;
  const latestNeck = postureData?.length ? postureData[postureData.length - 1].neck : 0;
  const isDisconnected = connectionState === "disconnected";
  const isWaiting = connectionState === "waiting";
  const overallTone = isDisconnected ? "bad" : isWaiting ? "warn" : latestFatigue > 70 || latestNeck > 35 ? "bad" : latestFatigue > 50 || latestNeck > 20 ? "warn" : "good";
  const statusLabel = { bad: "Needs Attention", warn: "Fair", good: "Looking Good" };
  const statusLabelText = isDisconnected ? "Disconnected" : isWaiting ? "Waiting for device" : statusLabel[overallTone];
  
  let displayInsights = insights;
  if (isDisconnected) {
     displayInsights = [{ title: "Server Disconnected", desc: "Cannot reach Aligna backend. Please start the server.", tone: "bad" }];
  } else if (isWaiting) {
     displayInsights = [{ title: "Waiting for device...", desc: "No live data streaming. Please ensure the device is transmitting.", tone: "warn" }];
  }

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .ai-chat-input:focus { outline: none; border-color: rgba(16,185,129,0.6) !important; box-shadow: 0 0 0 3px rgba(16,185,129,0.12); }
        .send-btn:hover { background: linear-gradient(135deg,#059669,#7c3aed) !important; transform: scale(1.05); }
        .send-btn:active { transform: scale(0.97); }
        .suggest-chip:hover { background: rgba(16,185,129,0.2) !important; border-color: rgba(16,185,129,0.5) !important; color: #6ee7b7 !important; cursor: pointer; }
        .refresh-btn:hover { background: rgba(16,185,129,0.15) !important; }
      `}</style>

      {/* ── Section Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 6,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg,#10b981,#8b5cf6)",
              fontSize: 14,
            }}>🤖</span>
            AI Recommendations
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Powered by Google Gemini · Analyzing real-time posture data
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastInsightTime && (
            <span style={{ fontSize: 11, color: "#64748b" }}>Updated {lastInsightTime}</span>
          )}
          <span
            style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 9999,
              border: `1px solid ${toneColors[overallTone].border}`,
              background: toneColors[overallTone].bg,
              color: toneColors[overallTone].label,
              fontWeight: 600,
            }}
          >
            {statusLabelText}
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: "linear-gradient(90deg, rgba(148,163,184,0), rgba(148,163,184,0.2), rgba(148,163,184,0))", margin: "12px 0 20px" }} />

      {/* ── Two-Column Layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── LEFT: AI Insights ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#cbd5e1" }}>
              📊 Live Posture Analysis
            </div>
            <button
              className="refresh-btn"
              onClick={fetchInsights}
              disabled={insightsLoading || isWaiting || isDisconnected}
              style={{
                background: "transparent",
                border: "1px solid rgba(148,163,184,0.2)",
                color: "#94a3b8",
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 9999,
                cursor: insightsLoading || isWaiting || isDisconnected ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.2s",
              }}
            >
              <span style={{ display: "inline-block", animation: insightsLoading && !(isWaiting || isDisconnected) ? "spin 1s linear infinite" : "none" }}>↻</span>
              {insightsLoading && !(isWaiting || isDisconnected) ? "Analyzing..." : "Refresh"}
            </button>
          </div>

          {insightsLoading && !(isWaiting || isDisconnected) && displayInsights.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 72, borderRadius: 14,
                  background: "rgba(30,41,59,0.5)",
                  border: "1px solid rgba(148,163,184,0.1)",
                  animation: `typingDot 1.4s ease ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          )}

          {insightsError && !(isWaiting || isDisconnected) && (
            <div style={{
              padding: "14px 16px", borderRadius: 14,
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5", fontSize: 13,
            }}>
              {insightsError}
            </div>
          )}

          {!insightsLoading && !(isWaiting || isDisconnected) && displayInsights.length === 0 && !insightsError && (
            <div style={{
              padding: "20px", borderRadius: 14, textAlign: "center",
              background: "rgba(30,41,59,0.4)", border: "1px solid rgba(148,163,184,0.1)",
              color: "#64748b", fontSize: 13,
            }}>
              Waiting for posture data to generate insights…
            </div>
          )}

          {displayInsights.map((item, i) => (
            <InsightCard key={i} index={i} {...item} />
          ))}

          {/* ── Posture Snapshot ── */}
          <div style={{
            marginTop: 4, padding: "14px 16px", borderRadius: 14,
            background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.1)",
          }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Current Snapshot
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Neck Angle", value: `${(isDisconnected || isWaiting) ? "0.0" : latestNeck.toFixed(1)}°`, good: (isDisconnected || isWaiting) || latestNeck < 20 },
                { label: "Fatigue", value: `${(isDisconnected || isWaiting) ? "0" : latestFatigue.toFixed(0)}/100`, good: (isDisconnected || isWaiting) || latestFatigue < 50 },
                { label: "Good Posture", value: `${(isDisconnected || isWaiting) ? "0" : (metrics?.goodPercent ?? 0)}%`, good: (isDisconnected || isWaiting) || (metrics?.goodPercent ?? 0) >= 60 },
                { label: "Breaks", value: (isDisconnected || isWaiting) ? 0 : (metrics?.breaks ?? 0), good: true },
              ].map(({ label, value, good }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: good ? "#4ade80" : "#f87171" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: AI Chatbox ── */}
        <div style={{
          display: "flex", flexDirection: "column",
          background: "rgba(10,15,28,0.7)",
          border: "1px solid rgba(148,163,184,0.12)",
          borderRadius: 16, overflow: "hidden",
          minHeight: 420,
        }}>
          {/* Chat Header */}
          <div style={{
            padding: "12px 16px",
            background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(139,92,246,0.12))",
            borderBottom: "1px solid rgba(148,163,184,0.1)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg,#10b981,#8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
            }}>🤖</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Aligna AI Coach</div>
              <div style={{ fontSize: 11, color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 6px #22c55e" }} />
                Online · Context-aware
              </div>
            </div>
          </div>

          {/* Messages */}
          <div 
            ref={chatContainerRef}
            style={{
            flex: 1, overflowY: "auto", padding: "16px 14px",
            display: "flex", flexDirection: "column",
            scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.2) transparent",
          }}>
            {messages.map((msg, i) => <ChatBubble key={i} msg={msg} />)}
            {isChatLoading && <TypingIndicator />}
          </div>

          {/* Suggested prompts */}
          {messages.length <= 1 && (
            <div style={{ padding: "0 14px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTED.map(s => (
                <button
                  key={s}
                  className="suggest-chip"
                  onClick={() => sendMessage(s)}
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    color: "#94a3b8",
                    fontSize: 12,
                    padding: "5px 11px",
                    borderRadius: 9999,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid rgba(148,163,184,0.1)",
            display: "flex", gap: 8, alignItems: "flex-end",
          }}>
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your posture, pain, ergonomics…"
              rows={1}
              style={{
                flex: 1,
                background: "rgba(20,30,50,0.8)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 12,
                color: "#f1f5f9",
                fontSize: 13.5,
                padding: "10px 14px",
                resize: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
                transition: "border-color 0.2s, box-shadow 0.2s",
                maxHeight: 100,
                overflow: "auto",
              }}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={isChatLoading || !input.trim()}
              style={{
                background: "linear-gradient(135deg,#10b981,#8b5cf6)",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                width: 42, height: 42,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: isChatLoading || !input.trim() ? "not-allowed" : "pointer",
                opacity: isChatLoading || !input.trim() ? 0.5 : 1,
                fontSize: 18,
                flexShrink: 0,
                transition: "all 0.2s",
              }}
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
