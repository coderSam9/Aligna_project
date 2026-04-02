import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5051", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

const BONE_MAP = {
  spine:       ["mixamorig1Hips_01"],
  spineUpper:  ["mixamorig1Spine_02", "mixamorig1Spine1_03", "mixamorig1Spine2_04"],
  neck:        ["mixamorig1Neck_05"],
  head:        ["mixamorig1Head_06"],
  shoulderL:   ["mixamorig1LeftShoulder_08"],
  shoulderR:   ["mixamorig1RightShoulder_032"],
  upperArmL:   ["mixamorig1LeftArm_09"],
  upperArmR:   ["mixamorig1RightArm_033"],
  foreArmL:    ["mixamorig1LeftForeArm_010"],
  foreArmR:    ["mixamorig1RightForeArm_034"],
  hipL:        ["mixamorig1LeftUpLeg_055"],
  hipR:        ["mixamorig1RightUpLeg_060"],
  kneeL:       ["mixamorig1LeftLeg_056"],
  kneeR:       ["mixamorig1RightLeg_061"],
};

const COLOR_GOOD = new THREE.Color("#22c55e");
const COLOR_WARN = new THREE.Color("#facc15");
const COLOR_BAD  = new THREE.Color("#ef4444");
const ROT_LERP   = 0.12;
const COLOR_LERP = 0.06;

function findBone(bones, names) {
  return bones.find((b) => names.includes(b.name)) ||
    bones.find((b) => names.some((n) => b.name.toLowerCase().includes(n.toLowerCase()))) || null;
}

function lerpColor(c, t, s) {
  c.r += (t.r - c.r) * s; c.g += (t.g - c.g) * s; c.b += (t.b - c.b) * s;
}

function computeScore(pd, angle) {
  if (!pd) return 100;
  const { l_shoulder, r_shoulder, l_hip, r_hip } = pd;
  const penalties =
    Math.abs(l_shoulder[1] - r_shoulder[1]) * 120 +
    Math.abs(l_hip[1] - r_hip[1]) * 80 +
    Math.abs((l_shoulder[2] + r_shoulder[2]) / 2 - (l_hip[2] + r_hip[2]) / 2) * 100 +
    Math.max(0, Math.abs(angle) - 10) * 2;
  return Math.max(0, Math.min(100, 100 - penalties));
}

function stressColor(s) {
  if (s < 0.4) return COLOR_GOOD.clone().lerp(COLOR_WARN, s / 0.4);
  return COLOR_WARN.clone().lerp(COLOR_BAD, (s - 0.4) / 0.6);
}

// ── Avatar ──────────────────────────────────
function Avatar({ poseData, fatigue, angle, postureStatus }) {
  const { scene } = useGLTF("/models/human.glb");
  const group = useRef();
  const bones = useRef({});
  const meshes = useRef([]);
  const meshColors = useRef([]);
  const targets = useRef({
    spineX:0,spineZ:0,spineUpperX:0,spineUpperZ:0,
    neckX:0,neckZ:0,headX:0,headZ:0,
    shoulderLZ:0,shoulderRZ:0,hipLX:0,hipRX:0,
  });

  useEffect(() => {
    const fb=[], fm=[];
    scene.traverse((o) => {
      if (o.isBone) fb.push(o);
      if (o.isMesh) {
        if (!Array.isArray(o.material)) {
          o.material = o.material.clone();
          o.material.roughness = 0.6; o.material.metalness = 0.1;
        }
        fm.push(o);
      }
    });
    const b={};
    for (const [k,kw] of Object.entries(BONE_MAP)) b[k]=findBone(fb,kw);
    bones.current=b; meshes.current=fm;
    meshColors.current=fm.map(()=>new THREE.Color("#60a5fa"));
  }, [scene]);

  useFrame(() => {
    if (!group.current) return;
    const t = targets.current;
    const pd = poseData;
    if (pd) {
      const {l_shoulder,r_shoulder,l_hip,r_hip}=pd;
      const ms=[(l_shoulder[0]+r_shoulder[0])/2,(l_shoulder[1]+r_shoulder[1])/2,(l_shoulder[2]+r_shoulder[2])/2];
      const mh=[(l_hip[0]+r_hip[0])/2,(l_hip[1]+r_hip[1])/2,(l_hip[2]+r_hip[2])/2];
      const ft=THREE.MathUtils.clamp((ms[2]-mh[2])*1.8,-0.45,0.45);
      const st=THREE.MathUtils.clamp((l_shoulder[1]-r_shoulder[1])*2.2,-0.35,0.35);
      const ht=THREE.MathUtils.clamp((l_hip[1]-r_hip[1])*1.5,-0.25,0.25);
      const lr=THREE.MathUtils.clamp(-l_shoulder[1]*0.8,-0.4,0.4);
      const rr=THREE.MathUtils.clamp(-r_shoulder[1]*0.8,-0.4,0.4);
      t.spineX=ft*0.5; t.spineZ=st*0.4+ht*0.3; t.spineUpperX=ft*0.6; t.spineUpperZ=st*0.5;
      t.neckX=ft*0.8; t.neckZ=st*0.3; t.headX=ft*1.2; t.headZ=st*0.6;
      t.shoulderLZ=lr; t.shoulderRZ=-rr; t.hipLX=ht*0.5; t.hipRX=-ht*0.5;
    }
    const breathe=poseData?0:Math.sin(Date.now()*0.0006)*0.012;
    const ab=(bk,ax,tv,ex=0)=>{const bn=bones.current[bk];if(!bn)return;bn.rotation[ax]+=(tv+ex-bn.rotation[ax])*ROT_LERP;};
    ab("spine","x",t.spineX,breathe); ab("spine","z",t.spineZ);
    ab("spineUpper","x",t.spineUpperX,breathe*0.5); ab("spineUpper","z",t.spineUpperZ);
    ab("neck","x",t.neckX); ab("neck","z",t.neckZ);
    ab("head","x",t.headX); ab("head","z",t.headZ);
    ab("shoulderL","z",t.shoulderLZ); ab("shoulderR","z",t.shoulderRZ);
    ab("hipL","x",t.hipLX); ab("hipR","x",t.hipRX);

    const fn=Math.min(fatigue/100,1);
    const isBad=postureStatus==="bad", isWarn=postureStatus==="warning";
    const ns=isBad?0.85:isWarn?0.5:fn*0.3;
    const ss=isBad?0.9:isWarn?0.55:fn*0.35;
    const shs=Math.abs(t.shoulderLZ-t.shoulderRZ)*1.5+fn*0.2;
    const hs=Math.abs(t.hipLX-t.hipRX)*2+fn*0.15;
    const as=fn*0.25;
    const zs=(n)=>{
      const nl=n.toLowerCase();
      if(nl.includes("hips_01")) return ss;
      if(nl.includes("spine_02")||nl.includes("spine1_03")||nl.includes("spine2_04")) return ss*0.85;
      if(nl.includes("neck_05")||nl.includes("head_06")) return ns;
      if(nl.includes("leftshoulder_08")||nl.includes("rightshoulder_032")) return shs;
      if(nl.includes("leftarm_09")||nl.includes("rightarm_033")) return as;
      if(nl.includes("forearm")||nl.includes("hand")) return as*0.7;
      if(nl.includes("upleg")) return hs;
      if(nl.includes("leg_")||nl.includes("foot")||nl.includes("toe")) return fn*0.1;
      return fn*0.15;
    };
    meshes.current.forEach((m,i)=>{
      if(!m.material?.color) return;
      const sv=Math.min(zs(m.name),1);
      const tg=stressColor(sv);
      lerpColor(meshColors.current[i],tg,COLOR_LERP);
      m.material.color.copy(meshColors.current[i]);
      if(m.material.emissive) m.material.emissive.copy(meshColors.current[i]).multiplyScalar(sv>0.6?0.15:0);
    });
  });

  return <group ref={group}><primitive object={scene} scale={1.7} position={[0,-1.6,0]} /></group>;
}

// ── Panel UI components ──────────────────────
function ScoreRing({ score }) {
  const r=28, circ=2*Math.PI*r, fill=circ*(score/100);
  const color=score>75?"#22c55e":score>50?"#facc15":"#ef4444";
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:"6px 0 10px"}}>
      <svg width={72} height={72} style={{transform:"rotate(-90deg)"}}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 0.6s ease, stroke 0.4s"}}/>
      </svg>
      <div style={{position:"relative",marginTop:-50,fontSize:20,fontWeight:700,color,fontFamily:"monospace",transition:"color 0.4s"}}>
        {Math.round(score)}
      </div>
      <div style={{fontSize:9,color:"rgba(180,210,240,0.5)",letterSpacing:2,marginTop:30}}>POSTURE SCORE</div>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
      <span style={{color:"rgba(180,210,240,0.6)",fontSize:10,letterSpacing:1,fontFamily:"monospace"}}>{label}</span>
      <span style={{color:color||"#00c8ff",fontSize:11,fontWeight:700,fontFamily:"monospace"}}>{value}</span>
    </div>
  );
}

function StressBar({ label, value }) {
  const color=value<40?"#22c55e":value<70?"#facc15":"#ef4444";
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{color:"rgba(180,210,240,0.6)",fontSize:9,letterSpacing:1,fontFamily:"monospace"}}>{label}</span>
        <span style={{color,fontSize:9,fontFamily:"monospace"}}>{value}%</span>
      </div>
      <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${value}%`,background:color,borderRadius:2,transition:"width 0.5s ease, background 0.4s"}}/>
      </div>
    </div>
  );
}

function PanelCard({ title, children }) {
  return (
    <div style={{background:"rgba(8,15,30,0.82)",border:"1px solid rgba(0,200,255,0.18)",
      borderRadius:10,padding:"12px 14px",marginBottom:12,backdropFilter:"blur(8px)"}}>
      <div style={{color:"#00c8ff",fontSize:9,letterSpacing:3,textTransform:"uppercase",
        fontFamily:"monospace",marginBottom:10,borderBottom:"1px solid rgba(0,200,255,0.15)",paddingBottom:6}}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ConnectionDot({ connected }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
      <div style={{width:7,height:7,borderRadius:"50%",
        background:connected?"#22c55e":"#ef4444",
        boxShadow:connected?"0 0 6px #22c55e":"0 0 6px #ef4444",transition:"background 0.4s"}}/>
      <span style={{color:"rgba(180,210,240,0.6)",fontSize:9,fontFamily:"monospace",letterSpacing:1}}>
        {connected?"LIVE":"OFFLINE"}
      </span>
    </div>
  );
}

function AlertBanner({ postureStatus }) {
  const msg={bad:"⚠ Poor posture detected — sit upright",warning:"⚡ Posture degrading — adjust your position",good:null}[postureStatus];
  if (!msg) return null;
  const border=postureStatus==="bad"?"#ef4444":"#facc15";
  return (
    <div style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",
      background:postureStatus==="bad"?"rgba(239,68,68,0.15)":"rgba(250,204,21,0.15)",
      border:`1px solid ${border}`,borderRadius:8,padding:"6px 20px",
      color:border,fontSize:12,letterSpacing:1,fontFamily:"monospace",
      zIndex:10,pointerEvents:"none",whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

// ── Main export ──────────────────────────────
export default function SkeletonTwin() {
  const [poseData,      setPoseData]      = useState(null);
  const [fatigue,       setFatigue]       = useState(0);
  const [angle,         setAngle]         = useState(0);
  const [postureStatus, setPostureStatus] = useState("good");
  const [connected,     setConnected]     = useState(false);
  const [score,         setScore]         = useState(100);
  const [alertCount,    setAlertCount]    = useState(0);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [history,       setHistory]       = useState([]);

  const ns = postureStatus==="bad"?85:postureStatus==="warning"?50:Math.round(fatigue*0.3);
  const ss = postureStatus==="bad"?90:postureStatus==="warning"?55:Math.round(fatigue*0.35);
  const shs= Math.round(Math.min(100,fatigue*0.4+(postureStatus==="bad"?30:0)));
  const hs = Math.round(Math.min(100,fatigue*0.25));

  useEffect(()=>{
    socket.on("connect",()=>setConnected(true));
    socket.on("disconnect",()=>setConnected(false));
    socket.on("pose_data",(d)=>{
      const {poseData:pd,fatigue:ft=0,angle:ag=0,postureStatus:ps="good"}=d;
      setPoseData(pd);setFatigue(ft);setAngle(ag);setPostureStatus(ps);
      const sc=computeScore(pd,ag);
      setScore(sc);setHistory(h=>[...h.slice(-49),Math.round(sc)]);
      if(ps==="bad")setAlertCount(c=>c+1);
    });
    socket.on("posture_update",(d)=>{
      setAngle(d.angle??0);setFatigue(d.fatigueLevel??0);setPostureStatus(d.postureStatus??"good");
      const sc=Math.max(0,Math.min(100,100-Math.abs(d.angle)*2-d.fatigueLevel*0.3));
      setScore(sc);setHistory(h=>[...h.slice(-49),Math.round(sc)]);
      if(d.postureStatus==="bad")setAlertCount(c=>c+1);
    });
    return()=>{socket.off("connect");socket.off("disconnect");socket.off("pose_data");socket.off("posture_update");};
  },[]);

  useEffect(()=>{const id=setInterval(()=>setSessionSecs(s=>s+1),1000);return()=>clearInterval(id);},[]);

  const sessionTime=`${String(Math.floor(sessionSecs/60)).padStart(2,"0")}:${String(sessionSecs%60).padStart(2,"0")}`;
  const statusColor=postureStatus==="bad"?"#ef4444":postureStatus==="warning"?"#facc15":"#22c55e";
  const sparkPath=history.length>1
    ?history.map((v,i)=>{const x=(i/(history.length-1))*160,y=30-(v/100)*28;return`${i===0?"M":"L"}${x.toFixed(1)} ${y.toFixed(1)}`;}).join(" "):"";

  return (
    // Fills 100% of whatever container App gives it
    <div style={{
      width:"100%", height:"100%",
      display:"flex", flexDirection:"row",
      background:"radial-gradient(ellipse at 40% 40%, #0a1628 0%, #050a14 100%)",
      overflow:"hidden",
    }}>

      {/* LEFT SIDEBAR — 18% width, never less than 180px */}
      <div style={{
        width:"25%", minWidth:200, maxWidth:300,
        display:"flex", flexDirection:"column",
        padding:"16px 0 16px 16px",
        overflowY:"auto",
        flexShrink:0,
      }}>
        <PanelCard title="Posture Score">
          <ScoreRing score={score}/>
          <MetricRow label="STATUS"  value={postureStatus.toUpperCase()} color={statusColor}/>
          <MetricRow label="ANGLE"   value={`${angle.toFixed(1)}°`}      color={Math.abs(angle)>15?"#ef4444":"#22c55e"}/>
          <MetricRow label="FATIGUE" value={`${Math.round(fatigue)}%`}   color={fatigue>70?"#ef4444":fatigue>40?"#facc15":"#22c55e"}/>
        </PanelCard>
        <PanelCard title="Session">
          <MetricRow label="TIME"    value={sessionTime} color="#00c8ff"/>
          <MetricRow label="ALERTS"  value={alertCount}  color={alertCount>5?"#ef4444":"#facc15"}/>
          <MetricRow label="AVG SCR" value={history.length?`${Math.round(history.reduce((a,b)=>a+b,0)/history.length)}`:"--"}/>
          <ConnectionDot connected={connected}/>
        </PanelCard>
      </div>

      {/* 3D CANVAS — takes all remaining width */}
      <div style={{flex:1, position:"relative", overflow:"hidden"}}>
        <Canvas camera={{position:[0,1.2,3.6],fov:45}} shadows style={{width:"100%",height:"100%"}}>
          <ambientLight intensity={0.5}/>
          <directionalLight position={[3,6,3]} intensity={1.2} castShadow/>
          <directionalLight position={[-3,2,-2]} intensity={0.4} color="#0044aa"/>
          <pointLight position={[0,3,2]} intensity={0.6} color="#00c8ff"/>
          <Avatar poseData={poseData} fatigue={fatigue} angle={angle} postureStatus={postureStatus}/>
          <OrbitControls enableZoom={true} minDistance={2} maxDistance={6} enablePan={false}/>
        </Canvas>
        <AlertBanner postureStatus={postureStatus}/>
      </div>

      {/* RIGHT SIDEBAR — 18% width */}
      <div style={{
        width:"20%", minWidth:200, maxWidth:300,
        display:"flex", flexDirection:"column",
        padding:"16px 16px 16px 0",
        overflowY:"auto",
        flexShrink:0,
      }}>
        <PanelCard title="Stress Heatmap">
          <StressBar label="NECK / C7"    value={ns}/>
          <StressBar label="LOWER SPINE"  value={ss}/>
          <StressBar label="SHOULDERS"    value={shs}/>
          <StressBar label="HIP / PELVIS" value={hs}/>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:8}}>
            {[["#22c55e","Good"],["#facc15","Warning"],["#ef4444","Bad"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:c}}/>
                <span style={{color:"rgba(180,210,240,0.6)",fontSize:9,fontFamily:"monospace",letterSpacing:1}}>{l}</span>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard title="Score History">
          {history.length>1
            ?<svg width="100%" height={40} viewBox="0 0 160 32" preserveAspectRatio="none" style={{display:"block"}}>
                <path d={sparkPath} fill="none" stroke="#00c8ff" strokeWidth={1.5} strokeLinecap="round"/>
                <line x1={0} y1={30-(75/100)*28} x2={160} y2={30-(75/100)*28}
                  stroke="rgba(250,204,21,0.3)" strokeWidth={0.5} strokeDasharray="3 3"/>
              </svg>
            :<div style={{color:"rgba(180,210,240,0.3)",fontSize:9,fontFamily:"monospace",textAlign:"center"}}>Waiting for data...</div>
          }
        </PanelCard>

        <PanelCard title="Device">
          <MetricRow label="DEVICE ID" value={poseData?"CAM-01":"--"}    color="#00c8ff"/>
          <MetricRow label="FPS"       value={connected?"30":"0"}         color={connected?"#22c55e":"#ef4444"}/>
          <MetricRow label="LATENCY"   value={connected?"~12ms":"--"}     color="#00c8ff"/>
        </PanelCard>
      </div>

    </div>
  );
}
