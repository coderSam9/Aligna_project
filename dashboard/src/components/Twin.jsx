import React, { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid, Html, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { io } from "socket.io-client";
import { easing } from "maath";

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

const COLOR_GOOD = new THREE.Color("#00ccff"); // Bright vibrant tech cyan
const COLOR_WARN = new THREE.Color("#ffaa00"); // Warning orange
const COLOR_BAD  = new THREE.Color("#ff0000"); // Deep critical red

function findBone(bones, names) {
  return bones.find((b) => names.includes(b.name)) ||
    bones.find((b) => names.some((n) => b.name.toLowerCase().includes(n.toLowerCase()))) || null;
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
  const hotspotSpriteRef = useRef();
  const targets = useRef({
    spineX:0,spineZ:0,spineUpperX:0,spineUpperZ:0,
    neckX:0,neckZ:0,headX:0,headZ:0,
    shoulderLZ:0,shoulderRZ:0,hipLX:0,hipRX:0,
  });

  // Track max stress areas for HUD
  const [hudTags, setHudTags] = useState([]);

  // Generate a native 3D soft medical fuzzy heatmap texture
  const heatmapTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 0, 0, 1)');
    grad.addColorStop(0.2, 'rgba(255, 0, 44, 0.8)');
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => {
    const fb=[], fm=[];
    scene.traverse((o) => {
      if (o.isBone) fb.push(o);
      if (o.isMesh) {
        if (!Array.isArray(o.material)) {
          o.material = new THREE.MeshStandardMaterial({
            color: o.material.color,
            roughness: 0.2, // Techy smooth
            metalness: 0.8, // Metallic look
            transparent: true,
            opacity: 0.85,
            wireframe: false
          });
        }
        fm.push(o);
      }
    });
    const b={};
    for (const [k,kw] of Object.entries(BONE_MAP)) b[k]=findBone(fb,kw);
    bones.current=b; meshes.current=fm;
    meshColors.current=fm.map(()=>new THREE.Color("#00ccff"));
  }, [scene]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = targets.current;
    const pd = poseData;
    if (pd) {
      const {l_shoulder,r_shoulder,l_hip,r_hip}=pd;
      const ms=[(l_shoulder[0]+r_shoulder[0])/2,(l_shoulder[1]+r_shoulder[1])/2,(l_shoulder[2]+r_shoulder[2])/2];
      const mh=[(l_hip[0]+r_hip[0])/2,(l_hip[1]+r_hip[1])/2,(l_hip[2]+r_hip[2])/2];
      const ft=THREE.MathUtils.clamp((ms[2]-mh[2])*1.8,-1.2,1.2);
      const st=THREE.MathUtils.clamp((l_shoulder[1]-r_shoulder[1])*2.2,-0.8,0.8);
      const ht=THREE.MathUtils.clamp((l_hip[1]-r_hip[1])*1.5,-0.6,0.6);
      const lr=THREE.MathUtils.clamp(-l_shoulder[1]*0.8,-0.8,0.8);
      const rr=THREE.MathUtils.clamp(-r_shoulder[1]*0.8,-0.8,0.8);
      t.spineX=ft*0.5; t.spineZ=st*0.4+ht*0.3; t.spineUpperX=ft*0.6; t.spineUpperZ=st*0.5;
      t.neckX=ft*0.8; t.neckZ=st*0.3; t.headX=ft*1.2; t.headZ=st*0.6;
      t.shoulderLZ=lr; t.shoulderRZ=-rr; t.hipLX=ht*0.5; t.hipRX=-ht*0.5;
    }
    const breathe=poseData?0:Math.sin(Date.now()*0.0006)*0.012;
    
    // Smooth damp bones natively so Three.js Euler matrices update properly
    const ab=(bk,ax,tv,ex=0)=>{
      const bn=bones.current[bk];
      if(!bn)return;
      bn.rotation[ax] = THREE.MathUtils.lerp(bn.rotation[ax], tv+ex, 0.08);
    };

    ab("spine","x",t.spineX,breathe); ab("spine","z",t.spineZ);
    ab("spineUpper","x",t.spineUpperX,breathe*0.5); ab("spineUpper","z",t.spineUpperZ);
    ab("neck","x",t.neckX); ab("neck","z",t.neckZ);
    ab("head","x",t.headX); ab("head","z",t.headZ);
    ab("shoulderL","z",t.shoulderLZ); ab("shoulderR","z",t.shoulderRZ);
    ab("hipL","x",t.hipLX); ab("hipR","x",t.hipRX);

    // Color and glow logic
    // Base metabolic stress from status
    const fn=Math.min(fatigue/100,1);
    const isBad=postureStatus==="bad", isWarn=postureStatus==="warning";
    const baseStress = isBad ? 0.4 : isWarn ? 0.2 : (fn * 0.1);
    
    // Physical positional stress (Dynamic)
    // As forward tilt (neckX) increases, massive strain shifts specifically to the neck
    const ns = Math.min(1, baseStress + Math.abs(t.neckX) * 0.9);
    const ss = Math.min(1, baseStress + Math.abs(t.spineX) * 0.6 + 0.2);
    const shs = Math.min(1, Math.abs(t.shoulderLZ-t.shoulderRZ) * 1.5 + baseStress);
    const hs = Math.min(1, Math.abs(t.hipLX-t.hipRX) * 2 + baseStress);
    const as = fn * 0.25;

    let localTags = [];

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
      
      meshColors.current[i].lerp(tg, 0.1);
      m.material.color.copy(meshColors.current[i]);
      
      // Make high stress areas actually bloom and redden intensely
      // Note: We leave the base skin color uniformly applied. The localized red spots will come from our point lights!
      if(m.material.emissive) {
         m.material.emissive.copy(meshColors.current[i]);
         m.material.emissiveIntensity = 0.05;
      }
      
      // Register tags for extreme hotspots periodically
      if (sv > 0.8 && localTags.length < 2 && Math.random() < 0.05) {
         let tagLabel = "STRESS";
         if(m.name.toLowerCase().includes("neck")) tagLabel = "NECK STRAIN";
         if(m.name.toLowerCase().includes("spine")) tagLabel = "LUMBAR COMPRESSION";
         if(m.name.toLowerCase().includes("shoulder")) tagLabel = "SHOULDER IMBALANCE";
         
         if(!localTags.some(t => t.label === tagLabel)) {
           localTags.push({ label: tagLabel, boneName: m.name });
         }
      }
    });

    // Dynamically track the SINGLE highest stress joint to prevent WebGL multiple-light crashes
    // We move one intensely glowing red bulb to whatever joint is hurting the most!
    let maxSv = 0;
    let worstBoneName = null;
    let worstBone = null;

    Object.keys(BONE_MAP).forEach(key => {
      const bone = bones.current[key];
      if (bone) {
        let sv = 0;
        if (key.includes("neck") || key.includes("head")) sv = ns;
        else if (key.includes("spine")) sv = ss;
        else if (key.includes("shoulder")) sv = shs;
        else if (key.includes("hip")) sv = hs;
        else if (key.includes("Arm")) sv = as;

        if (sv > maxSv) {
           maxSv = sv;
           worstBone = bone;
        }
      }
    });

    if (hotspotSpriteRef.current) {
        if (maxSv > 0.4 && worstBone) {
            worstBone.getWorldPosition(hotspotSpriteRef.current.position);
            // Gently pulse the size and opacity of the red heatmap for total realism
            const p = 1 + Math.sin(Date.now() * 0.005) * 0.1;
            hotspotSpriteRef.current.scale.setScalar(0.6 * p); // Halved the size for strict precision
            hotspotSpriteRef.current.material.opacity = (maxSv - 0.4) * 2;
        } else {
            hotspotSpriteRef.current.material.opacity = 0;
        }
    }

    if (Math.random() < 0.05) {
       setHudTags(localTags);
    }

    // Dynamic Camera Effects
    if (isBad) {
       state.camera.position.x += (Math.random() - 0.5) * 0.01;
       state.camera.position.y += (Math.random() - 0.5) * 0.01;
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} scale={1.7} position={[0,-1.6,0]} />
      {/* Volumetric medical heatmap perfectly blended natively */}
      <sprite ref={hotspotSpriteRef}>
         <spriteMaterial map={heatmapTexture} color="#ff0000" blending={THREE.AdditiveBlending} depthTest={false} transparent={true} opacity={0} />
      </sprite>
      
      {hudTags.map((tag, i) => {
         const bone = meshes.current.find(m => m.name === tag.boneName);
         if (!bone) return null;
         const pos = new THREE.Vector3();
         bone.getWorldPosition(pos);
         return (
           <Html key={i} position={[pos.x, pos.y, pos.z]} center>
             <div style={{
               background: "rgba(255, 0, 68, 0.2)",
               border: "1px solid #ff0044",
               backdropFilter: "blur(4px)",
               color: "#ff0044",
               padding: "4px 8px",
               fontSize: 10,
               fontWeight: "bold",
               fontFamily: "monospace",
               letterSpacing: 2,
               whiteSpace: "nowrap",
               pointerEvents: "none",
               textTransform: "uppercase",
               boxShadow: "0 0 10px rgba(255, 0, 68, 0.5)"
             }}>
               ⚠ {tag.label}
             </div>
           </Html>
         );
      })}
    </group>
  );
}

// ── Panel UI components ──────────────────────
function ScoreRing({ score }) {
  const r=28, circ=2*Math.PI*r, fill=circ*(score/100);
  const color=score>75?"#00ffcc":score>50?"#ffaa00":"#ff0044";
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:"6px 0 10px"}}>
      <svg width={72} height={72} style={{transform:"rotate(-90deg)"}}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s", filter: `drop-shadow(0 0 4px ${color})`}}/>
      </svg>
      <div style={{position:"relative",marginTop:-50,fontSize:22,fontWeight:800,color,fontFamily:"monospace",transition:"color 0.4s", textShadow: `0 0 8px ${color}`}}>
        {Math.round(score)}
      </div>
      <div style={{fontSize:9,color:"rgba(180,210,240,0.7)",letterSpacing:3,marginTop:30}}>SYS SCORE</div>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
      <span style={{color:"rgba(180,210,240,0.6)",fontSize:10,letterSpacing:2,fontFamily:"monospace"}}>{label}</span>
      <span style={{color:color||"#00e5ff",fontSize:12,fontWeight:700,fontFamily:"monospace", textShadow: color ? `0 0 5px ${color}` : "none"}}>{value}</span>
    </div>
  );
}

function StressBar({ label, value }) {
  const color=value<40?"#00ffcc":value<70?"#ffaa00":"#ff0044";
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{color:"rgba(180,210,240,0.6)",fontSize:9,letterSpacing:1.5,fontFamily:"monospace"}}>{label}</span>
        <span style={{color,fontSize:10,fontFamily:"monospace", fontWeight:"bold", textShadow:`0 0 4px ${color}`}}>{value}%</span>
      </div>
      <div style={{height:4,background:"rgba(255,255,255,0.05)",borderRadius:2,overflow:"hidden", border:"1px solid rgba(255,255,255,0.1)"}}>
        <div style={{height:"100%",width:`${value}%`,background:color,borderRadius:1,transition:"width 0.8s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s", boxShadow:`0 0 8px ${color}`}}/>
      </div>
    </div>
  );
}

function PanelCard({ title, children }) {
  return (
    <div style={{background:"rgba(4, 8, 16, 0.6)",border:"1px solid rgba(0, 229, 255, 0.3)",
      borderRadius:6,padding:"16px",marginBottom:16,backdropFilter:"blur(12px)", boxShadow:"inset 0 0 20px rgba(0, 229, 255, 0.05)"}}>
      <div style={{color:"#00e5ff",fontSize:10,fontWeight:"bold",letterSpacing:4,textTransform:"uppercase",
        fontFamily:"monospace",marginBottom:14,borderBottom:"1px solid rgba(0,229,255,0.3)",paddingBottom:8, display:"flex", alignItems:"center"}}>
        <div style={{width:6, height:6, background:"#00e5ff", marginRight:8, borderRadius:"50%", boxShadow:"0 0 8px #00e5ff"}} />
        {title}
      </div>
      {children}
    </div>
  );
}

function ConnectionDot({ connected }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12, padding:"8px", background:"rgba(0,0,0,0.3)", borderRadius:4, border:"1px solid rgba(255,255,255,0.05)"}}>
      <div style={{width:8,height:8,borderRadius:"50%",
        background:connected?"#00ffcc":"#ff0044",
        boxShadow:connected?"0 0 10px #00ffcc":"0 0 10px #ff0044",transition:"background 0.4s"}}/>
      <span style={{color:connected?"#00ffcc":"#ff0044",fontSize:10,fontFamily:"monospace",letterSpacing:2, fontWeight:"bold"}}>
        {connected?"UPLINK ACTIVE":"SIGNAL LOST"}
      </span>
    </div>
  );
}

function AlertBanner({ postureStatus }) {
  const msg={bad:"CRITICAL POSTURE DEGRADATION",warning:"WARNING: POSTURE ANOMALY DETECTED",good:null}[postureStatus];
  if (!msg) return null;
  const border=postureStatus==="bad"?"#ff0044":"#ffaa00";
  return (
    <div style={{position:"absolute",top:24,left:"50%",transform:"translateX(-50%)",
      background:postureStatus==="bad"?"rgba(255,0,68,0.15)":"rgba(255,170,0,0.15)",
      border:`1px solid ${border}`,borderRadius:4,padding:"10px 30px",
      color:border,fontSize:14,fontWeight:"bold",letterSpacing:4,fontFamily:"monospace",
      zIndex:10,pointerEvents:"none",whiteSpace:"nowrap", textShadow:`0 0 8px ${border}`, backdropFilter:"blur(4px)",
      boxShadow:`0 0 20px ${postureStatus==="bad"?"rgba(255,0,68,0.3)":"rgba(255,170,0,0.3)"}`}}>
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
  const [connected,     setConnected]     = useState(socket.connected);
  const [score,         setScore]         = useState(100);
  const [alertCount,    setAlertCount]    = useState(0);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [history,       setHistory]       = useState([]);

  const ns = postureStatus==="bad"?85:postureStatus==="warning"?50:Math.round(fatigue*0.3);
  const ss = postureStatus==="bad"?90:postureStatus==="warning"?55:Math.round(fatigue*0.35);
  const shs= Math.round(Math.min(100,fatigue*0.4+(postureStatus==="bad"?30:0)));
  const hs = Math.round(Math.min(100,fatigue*0.25));

  useEffect(()=>{
    if (socket.connected) setConnected(true);
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
  const statusColor=postureStatus==="bad"?"#ff0044":postureStatus==="warning"?"#ffaa00":"#00ffcc";
  const sparkPath=history.length>1
    ?history.map((v,i)=>{const x=(i/(history.length-1))*160,y=30-(v/100)*28;return`${i===0?"M":"L"}${x.toFixed(1)} ${y.toFixed(1)}`;}).join(" "):"";

  return (
    <div style={{
      width:"100%", height:"100%",
      display:"flex", flexDirection:"row",
      background:"#020408", // Deep tech black
      backgroundImage: "radial-gradient(ellipse at center, rgba(0, 229, 255, 0.05) 0%, transparent 70%)",
      overflow:"hidden",
    }}>

      {/* LEFT SIDEBAR */}
      <div style={{
        width:"25%", minWidth:220, maxWidth:320,
        display:"flex", flexDirection:"column",
        padding:"24px 0 24px 24px",
        overflowY:"auto",
        flexShrink:0,
        zIndex:2,
      }}>
        <PanelCard title="Telemetry">
          <ScoreRing score={score}/>
          <MetricRow label="INTEGRITY" value={postureStatus.toUpperCase()} color={statusColor}/>
          <MetricRow label="DEVIATION"   value={`${angle.toFixed(1)}°`}      color={Math.abs(angle)>15?"#ff0044":"#00ffcc"}/>
          <MetricRow label="FATIGUE IDX" value={`${Math.round(fatigue)}%`}   color={fatigue>70?"#ff0044":fatigue>40?"#ffaa00":"#00ffcc"}/>
        </PanelCard>
        <PanelCard title="System Ops">
          <MetricRow label="UPTIME"    value={sessionTime} color="#00e5ff"/>
          <MetricRow label="ANOMALIES"  value={alertCount}  color={alertCount>5?"#ff0044":"#ffaa00"}/>
          <MetricRow label="MEAN SYNC" value={history.length?`${Math.round(history.reduce((a,b)=>a+b,0)/history.length)}`:"--"}/>
          <ConnectionDot connected={connected}/>
        </PanelCard>
      </div>

      {/* 3D CANVAS */}
      <div style={{flex:1, position:"relative", overflow:"hidden"}}>
        <Canvas camera={{position:[0,1.2,3.8],fov:45}}>
          <color attach="background" args={["#020408"]} />
          <ambientLight intensity={0.4}/>
          <spotLight position={[5, 5, 5]} intensity={2.0} color="#0088ff" penumbra={1} aungular={0.5} />
          <spotLight position={[-5, 5, -5]} intensity={2.0} color="#ff0044" penumbra={1} aungular={0.5} />
          
          {/* Techy Environment */}
          <Environment preset="city" blur={0.8} />
          
          <Grid infiniteGrid fadeDistance={20} sectionColor="#004488" cellColor="#001133" sectionSize={1} cellSize={0.2} position={[0, -1.6, 0]} />
          <ContactShadows position={[0, -1.59, 0]} opacity={0.5} scale={10} blur={2} far={4} />

          <Avatar poseData={poseData} fatigue={fatigue} angle={angle} postureStatus={postureStatus}/>
          <OrbitControls enableZoom={true} minDistance={2} maxDistance={6} enablePan={false} autoRotate={postureStatus==="good"} autoRotateSpeed={0.5} />
          
          <EffectComposer multisampling={4}>
             <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} height={300} intensity={1.5} />
             <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
        <AlertBanner postureStatus={postureStatus}/>
        
        {/* Reticle Overlay */}
        <div style={{position:"absolute", top:"50%", left:"50%", transform:"translate(-50%, -50%)", width: "80%", height: "80%", border: "1px dashed rgba(0, 229, 255, 0.1)", borderRadius: "50%", pointerEvents: "none", zIndex:1 }}>
           <div style={{position:"absolute", top:0, left:"50%", width:2, height:15, background:"rgba(0, 229, 255, 0.5)", transform:"translateX(-50%)"}} />
           <div style={{position:"absolute", bottom:0, left:"50%", width:2, height:15, background:"rgba(0, 229, 255, 0.5)", transform:"translateX(-50%)"}} />
           <div style={{position:"absolute", left:0, top:"50%", height:2, width:15, background:"rgba(0, 229, 255, 0.5)", transform:"translateY(-50%)"}} />
           <div style={{position:"absolute", right:0, top:"50%", height:2, width:15, background:"rgba(0, 229, 255, 0.5)", transform:"translateY(-50%)"}} />
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div style={{
        width:"25%", minWidth:220, maxWidth:320,
        display:"flex", flexDirection:"column",
        padding:"24px 24px 24px 0",
        overflowY:"auto",
        flexShrink:0,
        zIndex:2,
      }}>
        <PanelCard title="Stress Diagnostics">
          <StressBar label="CERVICAL SECT (C1-C7)"    value={ns}/>
          <StressBar label="LUMBAR SECT (L1-L5)"  value={ss}/>
          <StressBar label="DELTOID TENSION"    value={shs}/>
          <StressBar label="PELVIC TILT" value={hs}/>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:16}}>
             {[["#00ffcc","NOMINAL"],["#ffaa00","ELEVATED"],["#ff0044","CRITICAL"]].map(([c,l])=>(
               <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:8,height:8,borderRadius:"1px",background:c, boxShadow:`0 0 6px ${c}`}}/>
                  <span style={{color:"rgba(180,210,240,0.8)",fontSize:8,fontFamily:"monospace",letterSpacing:1, fontWeight:"bold"}}>{l}</span>
               </div>
             ))}
          </div>
        </PanelCard>

        <PanelCard title="Signal Graph">
          {history.length>1
            ?<svg width="100%" height={50} viewBox="0 0 160 40" preserveAspectRatio="none" style={{display:"block", background:"rgba(0,0,0,0.2)", borderRadius:4}}>
                <path d={sparkPath} fill="none" stroke="#00e5ff" strokeWidth={1.5} strokeLinecap="round" style={{filter:"drop-shadow(0 0 2px #00e5ff)"}}/>
                <line x1={0} y1={40-(75/100)*38} x2={160} y2={40-(75/100)*38}
                  stroke="rgba(255, 170, 0, 0.4)" strokeWidth={1} strokeDasharray="4 4"/>
              </svg>
            :<div style={{color:"rgba(180,210,240,0.4)",fontSize:10,fontFamily:"monospace",textAlign:"center", padding:"10px"}}>AWAITING PACKETS...</div>
          }
        </PanelCard>


      </div>

    </div>
  );
}
