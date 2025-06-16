"use client";
import { useRef, useEffect, useState } from "react";
import * as Tone from "tone";
import * as handpose from "@tensorflow-models/handpose";
import * as tf from "@tensorflow/tfjs";

export default function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const toneStartedRef = useRef(false);
  const dotsRef = useRef([]);
  const lastPlayTimeRef = useRef(0);
  const lastPointRef = useRef(null);
  const [showInstructions, setShowInstructions] = useState(true);

  const synthLeft = useRef(null);
  const synthRight = useRef(null);
  const reverb = useRef(null);

  const scale = [
    "C4", "D4", "E4", "F4", "G4", "A4", "B4",
    "C5", "D5", "E5", "F5", "G5", "A5", "C6"
  ];

  const getColorForNote = (index) => {
    const hue = 20 + (240 - 20) * (index / (scale.length - 1));
    return `hsl(${hue}, 100%, 60%)`;
  };

  useEffect(() => {
    reverb.current = new Tone.Reverb({ decay: 2, wet: 0.5 }).toDestination();
    synthLeft.current = new Tone.Synth().connect(reverb.current);
    synthRight.current = new Tone.MonoSynth().connect(reverb.current);
  }, []);

  const playSound = (x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = Date.now();
    if (now - lastPlayTimeRef.current < 200) return;
    lastPlayTimeRef.current = now;

    const height = canvas.height;
    const width = canvas.width;
    const pitchIndex = Math.floor(((height - y) / height) * scale.length);
    const note = scale[Math.max(0, Math.min(pitchIndex, scale.length - 1))];
    const color = getColorForNote(pitchIndex);

    if (!toneStartedRef.current) {
      Tone.start().then(() => {
        toneStartedRef.current = true;
        console.log("🔓 Tone.js 啟動");
      });
      return;
    }

    if (x < width / 2) {
      synthLeft.current.triggerAttackRelease(note, "8n");
    } else {
      synthRight.current.triggerAttackRelease(note, "8n");
    }

    let velocity = 1;
    if (lastPointRef.current) {
      const dx = x - lastPointRef.current.x;
      const dy = y - lastPointRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
    
      // 使用對數或根號縮放，避免距離一大就爆炸
      velocity = Math.log(distance + 1); // 加1避免 log(0)
    }
    lastPointRef.current = { x, y };
    
    // 調整 radius 計算方式讓變化更明顯
    const baseRadius = 4;
    const scaledVelocity = Math.pow(velocity, 1.2);  // 讓變化非線性、但敏感一點
    const dynamicRadius = baseRadius + scaledVelocity * 2; // 2 是倍數可以再微調
    const clampedRadius = Math.min(dynamicRadius, 40);  // 提高最大半徑

    
    dotsRef.current.push({
      x,
      y,
      initialRadius: clampedRadius,
      color,
      createdAt: now
    });

    console.log("🎵 播放", note, x < width / 2 ? "Synth" : "MonoSynth");
  };

  useEffect(() => {
    const setupCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };
    setupCamera();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      playSound(x, y);
    };

    canvas.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    let model;
    let animationId;

    const runHandpose = async () => {
      model = await handpose.load();
      console.log("✋ Handpose 模型已載入");

      const detect = async () => {
        if (videoRef.current && model) {
          const predictions = await model.estimateHands(videoRef.current);
          if (predictions.length > 0) {
            const [x, y] = predictions[0].landmarks[8];
            const canvas = canvasRef.current;
            if (canvas) {
              const scaleX = canvas.width / videoRef.current.videoWidth;
              const scaleY = canvas.height / videoRef.current.videoHeight;
              const canvasX = canvas.width - x * scaleX;
              const canvasY = y * scaleY;
              playSound(canvasX, canvasY);
            }
          }
        }
        animationId = requestAnimationFrame(detect);
      };

      detect();
    };

    runHandpose();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const draw = () => {
      const now = Date.now();
      const duration = 30000;

      ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      dotsRef.current = dotsRef.current.filter(dot => now - dot.createdAt < duration);

      for (const dot of dotsRef.current) {
        const elapsed = now - dot.createdAt;
        const progress = elapsed / duration;

        const pulse = 0.8 + 0.2 * Math.sin(progress * 2 * Math.PI);
        const radius = dot.initialRadius * Math.min(pulse, 1);
        const opacity = 1 - progress * 0.9;

        ctx.fillStyle = dot.color.replace("hsl", "hsla").replace(")", `, ${opacity})`);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, 2 * Math.PI);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, []);

  return (
    <main className="min-h-screen bg-cyan-100 flex flex-col items-center justify-start p-4">
      {showInstructions && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-bold text-cyan-600 mb-4">Gesture？Music！</h2>
          <p className="text-cyan-800 mb-4">
            透過手部追蹤與音高對應的點狀視覺 <br/>
            讓你「揮手即成旋律」<br/>
            每個點都是你創造的聲音與動作的足跡 <br/>
            音調由下往上是低到高，左右兩半是不同聲音 <br/>
            在這邊盡情探索，揮灑創意吧          
             </p>
          <button
            className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded shadow hover:bg-cyan-700"
            onClick={() => setShowInstructions(false)}
          >
            開始互動！
          </button>
        </div>
      )}

      <header className="w-full text-center text-3xl font-bold font-serif text-cyan-600 mb-4">
        Gesture？Music！
      </header>

      <section className="relative w-full h-[70vh] bg-cyan-50 rounded-xl overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute bottom-4 right-4 w-32 h-24 border-2 border-cyan-200 rounded-md shadow-md object-cover z-10 scale-x-[-1]"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full z-0 cursor-pointer"
        />
      </section>

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20 p-4">
          <div className="bg-cyan-50 w-full max-w-lg rounded-2xl shadow-2xl p-6 text-center border border-cyan-300 border-2">
            <h2 className="text-xl md:text-2xl font-bold text-cyan-600 mb-4">
              Gesture？Music！
            </h2>
            <p className="text-cyan-800 mb-6 leading-relaxed font-serif">
              透過手部追蹤與音高對應的點狀視覺 <br/>
              讓你「揮手即成旋律」<br/>
              每個點都是你創造的聲音與動作的足跡 <br/>
              音調由下往上是低到高，左右兩半是不同聲音 <br/>
              在這邊盡情探索，揮灑創意吧 
            </p>
            <button
              className="mt-2 px-5 py-2 bg-cyan-600 text-cyan-50 rounded-2xl font-semibold shadow hover:bg-cyan-700 transition"
              onClick={() => setShowInstructions(false)}
            >
              開始互動！
            </button>
          </div>
        </div>
      )}

      <footer className="mt-6 text-cyan-700 text-center text-sm font-serif">
        手勢控制音樂與顏色 🎶 揮動食指來演奏！
      </footer>
    </main>
  );
}
