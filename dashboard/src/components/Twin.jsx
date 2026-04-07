import React, { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid, Html, ContactShadows, Line } from "@react-three/drei";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { io } from "socket.io-client";
import { easing } from "maath";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export const socket = io(import.meta.env.VITE_SOCKET_URL || "http://localhost:5051", {
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

function GhostAvatar({ poseData, fatigue, postureStatus, baseline }) {
  // Use a completely unshared model cache by pulling the duplicated asset
  const { scene } = useGLTF("/models/human-ghost.glb");
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    c.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color("#00ff33"),
          transparent: true,
          opacity: 0.1,
          emissive: new THREE.Color("#00ff33"),
          emissiveIntensity: 0.5,
          wireframe: true,
          depthWrite: false
        });
      }
    });
    return c;
  }, [scene]);

  const bones = useRef({});
  useEffect(() => {
    const fb = [];
    clone.traverse(o => { if (o.isBone) fb.push(o); });
    const b = {};
    for (const [k,kw] of Object.entries(BONE_MAP)) b[k]=findBone(fb,kw);
    bones.current = b;
  }, [clone]);

  const targetTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const cx = 128, cy = 128;
    ctx.clearRect(0, 0, 256, 256);
    
    // Core dot
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); 
    ctx.fillStyle = "#ff0044"; ctx.fill();
    
    // Core glow
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 45);
    grad.addColorStop(0, "rgba(255,0,68,0.8)");
    grad.addColorStop(1, "rgba(255,0,68,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 45, 0, Math.PI*2); ctx.fill();
    
    // Concentric Rings
    const drawRing = (r, w, a) => {
       ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
       ctx.strokeStyle = `rgba(255, 0, 68, ${a})`;
       ctx.lineWidth = w; ctx.stroke();
    };
    drawRing(60, 6, 0.9);
    drawRing(85, 3, 0.6);
    drawRing(110, 2, 0.3);

    return new THREE.CanvasTexture(canvas);
  }, []);

  const spots = useMemo(() => [
    { id: 'head', boneKey: 'head', label: 'Head Tension', align: 'left' },
    { id: 'neck', boneKey: 'neck', label: 'Cervical Strain (Neck)', align: 'right' },
    { id: 'shoulderL', boneKey: 'shoulderL', label: 'L Shoulder', align: 'left' },
    { id: 'shoulderR', boneKey: 'shoulderR', label: 'R Shoulder', align: 'right' },
    { id: 'spineUpper', boneKey: 'spineUpper', label: 'Thoracic Load (Upper Back)', align: 'right' },
    { id: 'spine', boneKey: 'spine', label: 'Lumbar Comp (Lower Back)', align: 'left' },
    { id: 'kneeL', boneKey: 'kneeL', label: 'L Knee Stress', align: 'left' },
    { id: 'kneeR', boneKey: 'kneeR', label: 'R Knee Stress', align: 'right' },
  ], []);

  const hotspotsRef = useRef({});

  useFrame(() => {
    let rawSpineX=0, rawSpineZ=0, rawNeckX=0, rawShoulderLZ=0, rawShoulderRZ=0, rawHipLX=0, rawHipRX=0;

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
      
      rawSpineX=ft*0.5; rawSpineZ=st*0.4+ht*0.3;
      rawNeckX=ft*0.8; 
      rawShoulderLZ=lr; rawShoulderRZ=-rr; 
      rawHipLX=ht*0.5; rawHipRX=-ht*0.5;
    }

    const bl = baseline || {};
    const t = {
      spineX: rawSpineX - (bl.spineX || 0),
      neckX: rawNeckX - (bl.neckX || 0),
      shoulderLZ: rawShoulderLZ - (bl.shoulderLZ || 0),
      shoulderRZ: rawShoulderRZ - (bl.shoulderRZ || 0),
      hipLX: rawHipLX - (bl.hipLX || 0),
      hipRX: rawHipRX - (bl.hipRX || 0),
    };

    const fn = Math.min(fatigue / 100, 1);
    const isBad = postureStatus === "bad", isWarn = postureStatus === "warning";
    const baseStress = isBad ? 0.4 : isWarn ? 0.2 : (fn * 0.1);
    
    const ns = Math.min(1, baseStress + Math.abs(t.neckX) * 0.9);
    const ss = Math.min(1, baseStress + Math.abs(t.spineX) * 0.6 + 0.2);
    const shs = Math.min(1, Math.abs(t.shoulderLZ - t.shoulderRZ) * 1.5 + baseStress);
    const kneeS = Math.min(1, baseStress + fn * 0.35); 

    const stressMap = {
      head: ns,
      neck: ns * 0.9,
      shoulderL: shs,
      shoulderR: shs,
      spineUpper: ss * 0.8,
      spine: ss,
      kneeL: kneeS,
      kneeR: kneeS,
    };

    const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.1;

    spots.forEach(spot => {
       const bone = bones.current[spot.boneKey];
       const ref = hotspotsRef.current[spot.id];
       if (bone && ref && ref.group && ref.sprite) {
           const pos = new THREE.Vector3();
           bone.getWorldPosition(pos);
           ref.group.position.copy(pos);
           
           const stressVal = stressMap[spot.id] || 0;
           const threshold = 0.35;
           const isActive = stressVal > threshold;
           
           ref.sprite.scale.setScalar(0.22 * pulse); // STRICT 0.22 scale constraint
           ref.sprite.material.opacity = THREE.MathUtils.lerp(
               ref.sprite.material.opacity, 
               isActive ? (stressVal - threshold) * 2.5 : 0, 
               0.1
           );
           
           if (ref.htmlContainer) {
               ref.htmlContainer.style.opacity = isActive ? 1 : 0;
               ref.htmlContainer.style.transform = isActive ? 'scale(1)' : 'scale(0.85)';
           }
       }
    });
  });

  return (
    <group>
      <primitive object={clone} scale={1.7} position={[0, -1.6, 0]} />
      {spots.map((spot) => (
         <group key={spot.id} ref={el => {
             if (el) {
                if (!hotspotsRef.current[spot.id]) hotspotsRef.current[spot.id] = {};
                hotspotsRef.current[spot.id].group = el;
             }
         }}>
            <sprite ref={el => {
                if (el) {
                   if (!hotspotsRef.current[spot.id]) hotspotsRef.current[spot.id] = {};
                   hotspotsRef.current[spot.id].sprite = el;
                }
            }}>
                <spriteMaterial map={targetTex} color="#ff0044" blending={THREE.AdditiveBlending} depthTest={false} transparent opacity={0}/>
            </sprite>
            
            <Html center style={{ pointerEvents: 'none' }}>
               <div 
                  ref={el => {
                      if (el) {
                          if (!hotspotsRef.current[spot.id]) hotspotsRef.current[spot.id] = {};
                          hotspotsRef.current[spot.id].htmlContainer = el;
                      }
                  }}
                  style={{ 
                      opacity: 0, 
                      transition: 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s',
                      transformOrigin: spot.align === 'left' ? 'right center' : 'left center' 
                  }}
               >
                   <div style={{
                      position: 'absolute',
                      top: 0, // centered with center point
                      transform: 'translateY(-50%)',
                      left: spot.align === 'right' ? 12 : 'auto',
                      right: spot.align === 'left' ? 12 : 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      flexDirection: spot.align === 'right' ? 'row' : 'row-reverse',
                      width: '180px'
                   }}>
                       <div style={{ width: 30, height: 2, background: '#ff0044', boxShadow: '0 0 8px #ff0044' }} />
                       <div style={{ 
                           background: 'rgba(255, 0, 68, 0.2)', 
                           backdropFilter: 'blur(4px)',
                           border: '1px solid #ff0044', 
                           padding: '6px 12px', 
                           color: '#ffffff',
                           fontWeight: 'bold',
                           textShadow: '0 0 5px #ff0044',
                           fontFamily: 'sans-serif',
                           fontSize: 12,
                           borderRadius: 4,
                           whiteSpace: 'nowrap',
                           boxShadow: '0 4px 12px rgba(255, 0, 68, 0.3)'
                       }}>
                           {spot.label}
                       </div>
                   </div>
               </div>
            </Html>
         </group>
      ))}
    </group>
  );
}

// ── Avatar ──────────────────────────────────
function Avatar({ poseData, fatigue, angle, postureStatus, baseline, classificationDomRef }) {
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
    spineY: 0,
  });

  const spineLineRef = useRef();
  const shoulderLineRef = useRef();
  const idealLineRef = useRef();
  const comMeshRef = useRef();
  const comDropLineRef = useRef();

  const neckHtmlGroupRef = useRef();
  const spineHtmlGroupRef = useRef();
  const shoulderHtmlGroupRef = useRef();
  
  const neckDomRef = useRef();
  const spineDomRef = useRef();
  const shoulderDomRef = useRef();

  // Removed hudTags and heatmapTexture from Avatar as they are now in GhostAvatar

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
    
    let rawSpineX=0, rawSpineZ=0, rawSpineUpperX=0, rawSpineUpperZ=0, rawSpineY=0;
    let rawNeckX=0, rawNeckZ=0, rawHeadX=0, rawHeadZ=0;
    let rawShoulderLZ=0, rawShoulderRZ=0, rawHipLX=0, rawHipRX=0;

    if (pd) {
      const {l_shoulder,r_shoulder,l_hip,r_hip}=pd;
      const ms=[(l_shoulder[0]+r_shoulder[0])/2,(l_shoulder[1]+r_shoulder[1])/2,(l_shoulder[2]+r_shoulder[2])/2];
      const mh=[(l_hip[0]+r_hip[0])/2,(l_hip[1]+r_hip[1])/2,(l_hip[2]+r_hip[2])/2];
      const ft=THREE.MathUtils.clamp((ms[2]-mh[2])*1.8,-1.2,1.2);
      const st=THREE.MathUtils.clamp((l_shoulder[1]-r_shoulder[1])*2.2,-0.8,0.8);
      const ht=THREE.MathUtils.clamp((l_hip[1]-r_hip[1])*1.5,-0.6,0.6);
      const lr=THREE.MathUtils.clamp(-l_shoulder[1]*0.8,-0.8,0.8);
      const rr=THREE.MathUtils.clamp(-r_shoulder[1]*0.8,-0.8,0.8);
      const twist = THREE.MathUtils.clamp((l_shoulder[2]-r_shoulder[2])*1.5,-0.8,0.8);
      
      rawSpineX=ft*0.5; rawSpineZ=st*0.4+ht*0.3; rawSpineUpperX=ft*0.6; rawSpineUpperZ=st*0.5;
      rawSpineY=twist*0.6;
      rawNeckX=ft*0.8; rawNeckZ=st*0.3; rawHeadX=ft*1.2; rawHeadZ=st*0.6;
      rawShoulderLZ=lr; rawShoulderRZ=-rr; rawHipLX=ht*0.5; rawHipRX=-ht*0.5;
    }

    const bl = baseline || {};
    t.spineX = rawSpineX - (bl.spineX || 0);
    t.spineZ = rawSpineZ - (bl.spineZ || 0);
    t.spineY = rawSpineY - (bl.spineY || 0);
    t.spineUpperX = rawSpineUpperX - (bl.spineUpperX || 0);
    t.spineUpperZ = rawSpineUpperZ - (bl.spineUpperZ || 0);
    t.neckX = rawNeckX - (bl.neckX || 0);
    t.neckZ = rawNeckZ - (bl.neckZ || 0);
    t.headX = rawHeadX - (bl.headX || 0);
    t.headZ = rawHeadZ - (bl.headZ || 0);
    t.shoulderLZ = rawShoulderLZ - (bl.shoulderLZ || 0);
    t.shoulderRZ = rawShoulderRZ - (bl.shoulderRZ || 0);
    t.hipLX = rawHipLX - (bl.hipLX || 0);
    t.hipRX = rawHipRX - (bl.hipRX || 0);

    const breathe=poseData?0:Math.sin(Date.now()*0.0006)*0.012;
    
    // Smooth damp bones natively so Three.js Euler matrices update properly
    const ab=(bk,ax,tv,ex=0)=>{
      const bn=bones.current[bk];
      if(!bn)return;
      bn.rotation[ax] = THREE.MathUtils.lerp(bn.rotation[ax], tv+ex, 0.08);
    };

    ab("spine","x",t.spineX,breathe); ab("spine","z",t.spineZ); ab("spine","y",t.spineY);
    ab("spineUpper","x",t.spineUpperX,breathe*0.5); ab("spineUpper","z",t.spineUpperZ); ab("spineUpper","y",t.spineY*0.5);
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

    meshes.current.forEach((m,i)=>{
      if(!m.material?.color) return;
      
      // Avatar maintains a strict, neutral cyan color
      const tg=COLOR_GOOD;
      
      meshColors.current[i].lerp(tg, 0.1);
      m.material.color.copy(meshColors.current[i]);
      
      if(m.material.emissive) {
         m.material.emissive.copy(meshColors.current[i]);
         m.material.emissiveIntensity = 0.1; // mild cyan glow
      }
    });


    // Updates lines and Overlays
    if (bones.current.head && bones.current.spine && bones.current.shoulderL && bones.current.shoulderR) {
       const headPos = new THREE.Vector3(); bones.current.head.getWorldPosition(headPos);
       const spinePos = new THREE.Vector3(); bones.current.spine.getWorldPosition(spinePos);
       const sL = new THREE.Vector3(); bones.current.shoulderL.getWorldPosition(sL);
       const sR = new THREE.Vector3(); bones.current.shoulderR.getWorldPosition(sR);
       
       if (spineLineRef.current && spineLineRef.current.geometry) {
          spineLineRef.current.geometry.setPositions([headPos.x, headPos.y, headPos.z, spinePos.x, spinePos.y, spinePos.z]);
       }
       if (shoulderLineRef.current && shoulderLineRef.current.geometry) {
          shoulderLineRef.current.geometry.setPositions([sL.x, sL.y, sL.z, sR.x, sR.y, sR.z]);
       }
       if (idealLineRef.current && idealLineRef.current.geometry) {
          idealLineRef.current.geometry.setPositions([spinePos.x, spinePos.y, spinePos.z, spinePos.x, spinePos.y + 1.5, spinePos.z]);
       }

       const hL = new THREE.Vector3(); if (bones.current.hipL) bones.current.hipL.getWorldPosition(hL);
       const hR = new THREE.Vector3(); if (bones.current.hipR) bones.current.hipR.getWorldPosition(hR);
       
       if (hL.y && hR.y) {
          const msWorld = new THREE.Vector3().addVectors(sL, sR).multiplyScalar(0.5);
          const mhWorld = new THREE.Vector3().addVectors(hL, hR).multiplyScalar(0.5);
          const comWorld = new THREE.Vector3().addVectors(msWorld, mhWorld).multiplyScalar(0.5);
          
          if (comMeshRef.current) comMeshRef.current.position.copy(comWorld);
          if (comDropLineRef.current && comDropLineRef.current.geometry) {
             comDropLineRef.current.geometry.setPositions([comWorld.x, comWorld.y, comWorld.z, comWorld.x, -1.6, comWorld.z]);
          }
       }

       if (neckHtmlGroupRef.current) neckHtmlGroupRef.current.position.set(headPos.x + 0.3, headPos.y, headPos.z);
       if (spineHtmlGroupRef.current) spineHtmlGroupRef.current.position.set(spinePos.x + 0.3, spinePos.y, spinePos.z);
       if (shoulderHtmlGroupRef.current) shoulderHtmlGroupRef.current.position.set(sL.x + 0.2, sL.y + 0.1, sL.z);
       
       const neckDeg = Math.round(t.neckX * 50);
       const spineDeg = Math.round(t.spineX * 60);
       // Calculate true lateral tilt using the spine's Z-axis rotation (which tracks delta between left and right shoulder height)
       const tiltDeg = Math.round(t.spineUpperZ * 80);
       const twistDeg = Math.round(t.spineY * 40);

       if (neckDomRef.current) {
         const arrow = neckDeg > 10 ? "↑ PULL BACK" : neckDeg < -10 ? "↓ LEAN FWD" : "";
         neckDomRef.current.innerHTML = `NECK: ${Math.abs(neckDeg)}° <br/><span style="color:#ffaa00; font-size: 8px">${arrow}</span>`;
         neckDomRef.current.style.color = Math.abs(neckDeg) > 15 ? "#ff0044" : "#00ffcc";
       }
       if (spineDomRef.current) {
         const arrow = spineDeg > 10 ? "← STRAIGHTEN" : "";
         spineDomRef.current.innerHTML = `SPINE: ${Math.abs(spineDeg)}° <br/><span style="color:#ffaa00; font-size: 8px">${arrow}</span>`;
         spineDomRef.current.style.color = Math.abs(spineDeg) > 15 ? "#ff0044" : "#00ffcc";
       }
       if (shoulderDomRef.current) {
         const arrow = tiltDeg > 5 ? "↓ DROP RIGHT" : tiltDeg < -5 ? "↓ DROP LEFT" : "";
         shoulderDomRef.current.innerHTML = `TILT: ${Math.abs(tiltDeg)}° <br/><span style="color:#ffaa00; font-size: 8px">${arrow}</span>`;
         shoulderDomRef.current.style.color = Math.abs(tiltDeg) > 10 ? "#ff0044" : "#00ffcc";
       }

       if (classificationDomRef.current) {
          if (!pd) {
             classificationDomRef.current.innerHTML = '';
          } else {
             let classes = [];
             if (neckDeg > 15) classes.push("FORWARD HEAD DETECTED");
             if (spineDeg > 15) classes.push("LUMBAR SLOUCH");
             if (tiltDeg > 10) classes.push("RIGHT LEAN DETECTED");
             if (tiltDeg < -10) classes.push("LEFT LEAN DETECTED");
             if (twistDeg > 10 || twistDeg < -10) classes.push("TORSO TWIST");
             
             if (classes.length === 0) classes.push("✅ PERFECT POSTURE");

             classificationDomRef.current.innerHTML = classes.map(c => 
               c.includes("✅") 
                 ? `<div style="margin-bottom:4px; padding: 4px 8px; background: rgba(0,255,204,0.1); border: 1px solid #00ffcc; color: #00ffcc; border-radius: 4px; box-shadow: 0 0 10px rgba(0,255,204,0.2);">${c}</div>`
                 : `<div style="margin-bottom:4px; padding: 4px 8px; background: rgba(255,170,0,0.15); border: 1px solid #ffaa00; color: #ffaa00; border-radius: 4px; box-shadow: 0 0 10px rgba(255,170,0,0.2);">⚠️ ${c}</div>`
             ).join('');
          }
       }
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
      
      {/* Alignment Lines */}
      <Line ref={spineLineRef} points={[[0,0,0],[0,1,0]]} color="#00e5ff" lineWidth={2} dashed={true} dashScale={10} dashSize={0.1} dashOffset={0.2} depthTest={false} opacity={0.6} transparent={true} />
      <Line ref={shoulderLineRef} points={[[0,0,0],[0,1,0]]} color="#00e5ff" lineWidth={2} depthTest={false} opacity={0.6} transparent={true} />
      <Line ref={idealLineRef} points={[[0,0,0],[0,1,0]]} color="#00ff33" lineWidth={1.5} dashed={true} dashScale={10} dashSize={0.2} depthTest={false} opacity={0.6} transparent={true} />
      
      {/* Center of Mass (COM) */}
      <mesh ref={comMeshRef}>
         <sphereGeometry args={[0.05, 16, 16]} />
         <meshBasicMaterial color="#ffaa00" transparent opacity={0.8} />
      </mesh>
      <Line ref={comDropLineRef} points={[[0,0,0],[0,1,0]]} color="#ffaa00" lineWidth={1.5} dashed={true} dashScale={10} dashSize={0.1} depthTest={false} opacity={0.8} transparent={true} />

      {/* Angle Overlays */}
      <group ref={neckHtmlGroupRef}>
        <Html center zIndexRange={[100,0]}>
          <div ref={neckDomRef} style={{ whiteSpace:"nowrap", fontFamily:"monospace", fontWeight:"bold", fontSize: 10, background:"rgba(0,0,0,0.6)", padding:"4px 8px", borderRadius:4, borderLeft:"2px solid #00ffcc", letterSpacing: 1 }} />
        </Html>
      </group>
      <group ref={spineHtmlGroupRef}>
        <Html center zIndexRange={[100,0]}>
          <div ref={spineDomRef} style={{ whiteSpace:"nowrap", fontFamily:"monospace", fontWeight:"bold", fontSize: 10, background:"rgba(0,0,0,0.6)", padding:"4px 8px", borderRadius:4, borderLeft:"2px solid #00ffcc", letterSpacing: 1 }} />
        </Html>
      </group>
      <group ref={shoulderHtmlGroupRef}>
        <Html center zIndexRange={[100,0]}>
          <div ref={shoulderDomRef} style={{ whiteSpace:"nowrap", fontFamily:"monospace", fontWeight:"bold", fontSize: 10, background:"rgba(0,0,0,0.6)", padding:"4px 8px", borderRadius:4, borderLeft:"2px solid #00ffcc", letterSpacing: 1 }} />
        </Html>
      </group>

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

function ConnectionDot({ connectionState }) {
  let text = "";
  let color = "";
  if (connectionState === "sandbox") { text = "SANDBOX MODE ACTIVE"; color = "#00e5ff"; }
  else if (connectionState === "paused") { text = "SERVER CONNECTED\nSYSTEM PAUSED"; color = "#a855f7"; }
  else if (connectionState === "live") { text = "SERVER CONNECTED"; color = "#00ffcc"; }
  else if (connectionState === "waiting") { text = "SERVER CONNECTED\nWAITING FOR DATA"; color = "#ffaa00"; }
  else { text = "SERVER DISCONNECTED"; color = "#ff0044"; }

  return (
    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12,padding:"8px",background:"rgba(2,6,12,0.4)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:4}}>
      <div style={{width:8,height:8,borderRadius:"50%",
        background:color,
        boxShadow:`0 0 10px ${color}`,transition:"background 0.4s"}}/>
      <span style={{color:color,fontSize:10,fontFamily:"monospace",letterSpacing:1.5, fontWeight:"bold", whiteSpace:"pre-wrap"}}>
        {text}
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
export default function SkeletonTwin({ isManualMode, sandboxData, isRunning = true }) {
  const [poseData,      setPoseData]      = useState(null);
  const [fatigue,       setFatigue]       = useState(0);
  const [angle,         setAngle]         = useState(0);
  const [postureStatus, setPostureStatus] = useState("good");
  const [serverOk,      setServerOk]      = useState(false);
  const [receivingData, setReceivingData] = useState(false);
  const [score,         setScore]         = useState(100);
  const [alertCount,    setAlertCount]    = useState(0);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [history,       setHistory]       = useState([]);
  const [baseline,      setBaseline]      = useState(null);
  const receiveTimeout = useRef(null);

  const isManualModeRef = useRef(false);
  const isRunningRef = useRef(isRunning);
  const poseDataRef = useRef(null);
  const classificationDomRef = useRef(null);

  useEffect(() => {
    isManualModeRef.current = isManualMode;
  }, [isManualMode]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if ((isManualMode || !isRunning) && sandboxData) {
      setPoseData(sandboxData.poseData);
      poseDataRef.current = sandboxData.poseData;
      setFatigue(sandboxData.fatigueLevel || 0);
      setAngle(sandboxData.angle || 0);
      setPostureStatus(sandboxData.postureStatus || "good");
      
      const sc = computeScore(sandboxData.poseData, sandboxData.angle || 0);
      setScore(sc);
      setHistory(h => [...h.slice(-49), Math.round(sc)]);
      if (sandboxData.postureStatus === "bad") setAlertCount(c => c + 1);
    }
  }, [isManualMode, isRunning, sandboxData]);

  const calibrateBaseline = () => {
     if (poseData) {
       const {l_shoulder,r_shoulder,l_hip,r_hip} = poseData;
       const ms=[(l_shoulder[0]+r_shoulder[0])/2,(l_shoulder[1]+r_shoulder[1])/2,(l_shoulder[2]+r_shoulder[2])/2];
       const mh=[(l_hip[0]+r_hip[0])/2,(l_hip[1]+r_hip[1])/2,(l_hip[2]+r_hip[2])/2];
       const ft=THREE.MathUtils.clamp((ms[2]-mh[2])*1.8,-1.2,1.2);
       const st=THREE.MathUtils.clamp((l_shoulder[1]-r_shoulder[1])*2.2,-0.8,0.8);
       const ht=THREE.MathUtils.clamp((l_hip[1]-r_hip[1])*1.5,-0.6,0.6);
       const lr=THREE.MathUtils.clamp(-l_shoulder[1]*0.8,-0.8,0.8);
       const rr=THREE.MathUtils.clamp(-r_shoulder[1]*0.8,-0.8,0.8);
       const twist = THREE.MathUtils.clamp((l_shoulder[2]-r_shoulder[2])*1.5,-0.8,0.8);
       setBaseline({
         spineX: ft*0.5, spineZ: st*0.4+ht*0.3, spineY: twist*0.6, spineUpperX: ft*0.6, spineUpperZ: st*0.5,
         neckX: ft*0.8, neckZ: st*0.3, headX: ft*1.2, headZ: st*0.6,
         shoulderLZ: lr, shoulderRZ: -rr, hipLX: ht*0.5, hipRX: -ht*0.5
       });
     } else {
       setBaseline({
         spineX: 0, spineZ: 0, spineY: 0, spineUpperX: 0, spineUpperZ: 0,
         neckX: 0, neckZ: 0, headX: 0, headZ: 0,
         shoulderLZ: 0, shoulderRZ: 0, hipLX: 0, hipRX: 0
       });
     }
  };

  let connectionState = "disconnected";
  if (isManualMode) connectionState = "sandbox";
  else if (!isRunning && poseDataRef.current !== null) connectionState = "paused";
  else if (serverOk && receivingData) connectionState = "live";
  else if (serverOk && !receivingData) connectionState = "waiting";
  else connectionState = "disconnected";

  const isIdle = connectionState === "waiting" || connectionState === "disconnected";

  const ns = isIdle?0:postureStatus==="bad"?85:postureStatus==="warning"?50:Math.round(fatigue*0.3);
  const ss = isIdle?0:postureStatus==="bad"?90:postureStatus==="warning"?55:Math.round(fatigue*0.35);
  const shs= isIdle?0:Math.round(Math.min(100,fatigue*0.4+(postureStatus==="bad"?30:0)));
  const hs = isIdle?0:Math.round(Math.min(100,fatigue*0.25));

  useEffect(()=>{
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
  },[]);

  useEffect(()=>{
    const handlePoseData = (d)=>{
      setReceivingData(true);
      if (receiveTimeout.current) clearTimeout(receiveTimeout.current);
      receiveTimeout.current = setTimeout(() => setReceivingData(false), 2000);

      if (isManualModeRef.current) return;
      if (!isRunningRef.current && poseDataRef.current !== null) return;
      
      const {poseData:pd,fatigueLevel:ft=0,angle:ag=0,postureStatus:ps="good"}=d;
      poseDataRef.current = pd;
      setPoseData(pd);setFatigue(ft);setAngle(ag);setPostureStatus(ps);
      const sc=computeScore(pd,ag);
      setScore(sc);setHistory(h=>[...h.slice(-49),Math.round(sc)]);
      if(ps==="bad")setAlertCount(c=>c+1);
    };

    const handlePostureUpdate = (d)=>{
      if (isManualModeRef.current) return;
      if (!isRunningRef.current && poseDataRef.current !== null) return;
      setAngle(d.angle??0);setFatigue(d.fatigueLevel??0);setPostureStatus(d.postureStatus??"good");
      const sc=Math.max(0,Math.min(100,100-Math.abs(d.angle)*2-d.fatigueLevel*0.3));
      setScore(sc);setHistory(h=>[...h.slice(-49),Math.round(sc)]);
      if(d.postureStatus==="bad")setAlertCount(c=>c+1);
    };

    socket.on("pose_data", handlePoseData);
    socket.on("posture_update", handlePostureUpdate);

    return()=>{socket.off("pose_data", handlePoseData);socket.off("posture_update", handlePostureUpdate);};
  },[]);

  useEffect(()=>{const id=setInterval(()=>setSessionSecs(s=>s+1),1000);return()=>clearInterval(id);},[]);

  const sessionTime=`${String(Math.floor(sessionSecs/60)).padStart(2,"0")}:${String(sessionSecs%60).padStart(2,"0")}`;
  const statusColor=isIdle?"#00ffcc":postureStatus==="bad"?"#ff0044":postureStatus==="warning"?"#ffaa00":"#00ffcc";
  const displayHistory = isIdle ? [] : history;
  const sparkPath=displayHistory.length>1
    ?displayHistory.map((v,i)=>{const x=(i/(displayHistory.length-1))*160,y=30-(v/100)*28;return`${i===0?"M":"L"}${x.toFixed(1)} ${y.toFixed(1)}`;}).join(" "):"";

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
          <ScoreRing score={isIdle ? 0 : score}/>
          <MetricRow label="INTEGRITY" value={isIdle ? "GOOD" : postureStatus.toUpperCase()} color={statusColor}/>
          <MetricRow label="NECK ANGLE"   value={isIdle ? "0.00°" : `${angle.toFixed(2)}°`}      color={!isIdle && Math.abs(angle)>15?"#ff0044":"#00ffcc"}/>
          <MetricRow label="FATIGUE IDX" value={isIdle ? "0%" : `${Math.round(fatigue)}%`}   color={!isIdle && fatigue>70?"#ff0044":!isIdle && fatigue>40?"#ffaa00":"#00ffcc"}/>
        </PanelCard>
        <PanelCard title="System Ops">
          <MetricRow label="UPTIME"    value={sessionTime} color="#00e5ff"/>
          <MetricRow label="ANOMALIES"  value={isIdle ? 0 : alertCount}  color={!isIdle && alertCount>5?"#ff0044":"#ffaa00"}/>
          <MetricRow label="MEAN SYNC" value={displayHistory.length?`${Math.round(displayHistory.reduce((a,b)=>a+b,0)/displayHistory.length)}`:"--"}/>
          <ConnectionDot connectionState={connectionState}/>
          <button 
             onClick={calibrateBaseline}
             style={{
               width: "100%", marginTop: 16, padding: "8px", background: "rgba(0, 255, 51, 0.1)",
               border: "1px solid #00ff33", color: "#00ff33", fontSize: 10, fontWeight: "bold",
               fontFamily: "monospace", letterSpacing: 2, cursor: "pointer", transition: "all 0.2s"
             }}
             onMouseOver={(e) => { e.currentTarget.style.background = "rgba(0, 255, 51, 0.3)"; }}
             onMouseOut={(e) => { e.currentTarget.style.background = "rgba(0, 255, 51, 0.1)"; }}
          >
            {baseline ? "[ RE-CALIBRATE ]" : "[ CALIBRATE NEUTRAL ]"}
          </button>
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

          <GhostAvatar poseData={isIdle ? null : poseData} fatigue={isIdle ? 0 : fatigue} postureStatus={isIdle ? "good" : postureStatus} baseline={baseline} />
          <Avatar poseData={isIdle ? null : poseData} fatigue={isIdle ? 0 : fatigue} angle={isIdle ? 0 : angle} postureStatus={isIdle ? "good" : postureStatus} baseline={baseline} classificationDomRef={classificationDomRef} />
          <OrbitControls enableZoom={true} minDistance={2} maxDistance={6} enablePan={false} autoRotate={isIdle || postureStatus==="good"} autoRotateSpeed={0.5} />
          
          <EffectComposer multisampling={4}>
             <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} height={300} intensity={1.5} />
             <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Canvas>
        <AlertBanner postureStatus={isIdle ? "good" : postureStatus}/>
        
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
          <StressBar label="CERVICAL SECT (NECK)"    value={ns}/>
          <StressBar label="LUMBAR SECT (LOWER BACK)"  value={ss}/>
          <StressBar label="DELTOID TENSION (SHOULDERS)"    value={shs}/>
          <StressBar label="PELVIC TILT (HIPS)" value={hs}/>
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
          {displayHistory.length>1
            ?<svg width="100%" height={50} viewBox="0 0 160 40" preserveAspectRatio="none" style={{display:"block", background:"rgba(0,0,0,0.2)", borderRadius:4}}>
                <path d={sparkPath} fill="none" stroke="#00e5ff" strokeWidth={1.5} strokeLinecap="round" style={{filter:"drop-shadow(0 0 2px #00e5ff)"}}/>
                <line x1={0} y1={40-(75/100)*38} x2={160} y2={40-(75/100)*38}
                  stroke="rgba(255, 170, 0, 0.4)" strokeWidth={1} strokeDasharray="4 4"/>
              </svg>
            :<div style={{color:"rgba(180,210,240,0.4)",fontSize:10,fontFamily:"monospace",textAlign:"center", padding:"10px"}}>AWAITING PACKETS...</div>
          }
        </PanelCard>

        <PanelCard title="System Alerts">
           <div ref={classificationDomRef} style={{ display:"flex", flexDirection:"column", gap: 4, whiteSpace:"nowrap", fontFamily:"monospace", fontWeight:"bold", fontSize: 11, letterSpacing: 1 }} />
        </PanelCard>

      </div>

    </div>
  );
}

