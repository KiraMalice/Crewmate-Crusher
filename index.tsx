import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Configuration & Constants ---
const GAME_DURATION = 30;
const CREWMATE_COLORS = [
  '#C51111', '#132ED1', '#117F2D', '#ED54BA', '#EF7D0D', 
  '#F5F557', '#3F474E', '#D6E0F0', '#6B2FBB', '#71491E', '#38FEDB', '#50EF39'
];

type GameStatus = 'idle' | 'counting' | 'playing' | 'ended';

interface MoleState {
  id: number;
  active: boolean;
  color: string;
  feedback: 'hit' | 'miss' | null;
}

// --- Audio Engine ---
class SFXEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, slideTo?: number) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  pop() { this.playTone(180, 'sine', 0.1, 0.05, 500); }
  hit() { this.playTone(120, 'square', 0.1, 0.15, 30); }
  miss() { this.playTone(80, 'sine', 0.2, 0.1, 40); }
  tick() { this.playTone(900, 'sine', 0.04, 0.02); }
  start() { this.playTone(300, 'triangle', 0.4, 0.1, 900); }
}

const sfx = new SFXEngine();

// --- Components ---

const CrewmateVisual: React.FC<{ color: string; active: boolean; onWhack: () => void }> = ({ color, active, onWhack }) => (
  <div 
    className={`absolute inset-0 flex items-center justify-center transition-all duration-300 transform cursor-pointer ${
      active ? 'translate-y-2 opacity-100 scale-100' : 'translate-y-full opacity-0 scale-75 pointer-events-none'
    }`}
    onPointerDown={(e) => { e.stopPropagation(); onWhack(); }}
  >
    <div className="relative w-2/3 h-3/4 flex flex-col items-center crewmate-float">
      {/* Backpack */}
      <div className="absolute -left-2 top-1/4 w-[25%] h-1/2 rounded-l-lg z-0" style={{ backgroundColor: color, filter: 'brightness(0.6)' }} />
      {/* Body */}
      <div className="w-full h-full rounded-t-[45%] rounded-b-xl relative z-10 border-b-[6px] border-black/40 shadow-xl" style={{ backgroundColor: color }}>
        {/* Visor */}
        <div className="absolute top-[20%] left-[12%] w-[82%] h-[30%] bg-[#A1E3EF] rounded-3xl border-[3px] border-black/50 overflow-hidden">
           <div className="absolute top-1 left-2 w-1/2 h-1/3 bg-white/50 rounded-full" />
        </div>
      </div>
      {/* Legs */}
      <div className="flex justify-between w-full px-1 -mt-3 z-0">
        <div className="w-[36%] h-6 rounded-b-xl" style={{ backgroundColor: color, filter: 'brightness(0.8)' }} />
        <div className="w-[36%] h-6 rounded-b-xl" style={{ backgroundColor: color, filter: 'brightness(0.8)' }} />
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('crewmate_hs')) || 0);
  const [moles, setMoles] = useState<MoleState[]>(Array.from({ length: 9 }, (_, i) => ({ id: i, active: false, color: CREWMATE_COLORS[0], feedback: null })));
  const [countdown, setCountdown] = useState(3);
  const [securityLog, setSecurityLog] = useState("");
  const [isGeneratingLog, setIsGeneratingLog] = useState(false);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);
  
  const spawnTimerRef = useRef<number | null>(null);
  const gameTimerRef = useRef<number | null>(null);

  const fetchSecurityLog = async (finalScore: number) => {
    setIsGeneratingLog(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `The player just scored ${finalScore} in a "Whack-a-Crewmate" game. Generate a short, snarky 2-sentence security report from the Ship's computer. Mention things like "electrical", "venting", or "suspicious" in a funny way.`,
      });
      setSecurityLog(response.text || "Security systems compromised. Report missing.");
    } catch (e) {
      setSecurityLog("Communication with MIRA HQ lost. Probably an impostor in the server room.");
    } finally {
      setIsGeneratingLog(false);
    }
  };

  const stopGame = useCallback(() => {
    setStatus('ended');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('crewmate_hs', score.toString());
    }
    fetchSecurityLog(score);
    if (gameTimerRef.current) window.clearInterval(gameTimerRef.current);
    if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current);
  }, [score, highScore, ai]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setCountdown(3);
    setSecurityLog("");
    setStatus('counting');
    sfx.start();
  };

  useEffect(() => {
    if (status === 'counting') {
      const id = window.setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            window.clearInterval(id);
            setStatus('playing');
            return 0;
          }
          sfx.tick();
          return c - 1;
        });
      }, 1000);
      return () => window.clearInterval(id);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'playing') {
      gameTimerRef.current = window.setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            stopGame();
            return 0;
          }
          if (t < 6) sfx.tick();
          return t - 1;
        });
      }, 1000);

      const spawnLoop = () => {
        const progress = (GAME_DURATION - timeLeft) / GAME_DURATION;
        const spawnDelay = Math.max(180, 750 - (progress * 550));
        
        setMoles(prev => {
          const inactive = prev.filter(m => !m.active);
          if (inactive.length === 0) return prev;
          
          const target = inactive[Math.floor(Math.random() * inactive.length)];
          sfx.pop();
          
          const activeDuration = Math.max(300, 900 - (progress * 600));
          setTimeout(() => {
            setMoles(curr => curr.map(m => m.id === target.id ? { ...m, active: false } : m));
          }, activeDuration);

          return prev.map(m => m.id === target.id ? { 
            ...m, 
            active: true, 
            color: CREWMATE_COLORS[Math.floor(Math.random() * CREWMATE_COLORS.length)] 
          } : m);
        });

        spawnTimerRef.current = window.setTimeout(spawnLoop, spawnDelay);
      };

      spawnLoop();
      
      return () => {
        if (gameTimerRef.current) window.clearInterval(gameTimerRef.current);
        if (spawnTimerRef.current) window.clearTimeout(spawnTimerRef.current);
      };
    }
  }, [status, timeLeft, stopGame]);

  const onMoleWhack = (id: number) => {
    if (status !== 'playing') return;
    setMoles(prev => {
      const m = prev.find(x => x.id === id);
      if (m?.active) {
        sfx.hit();
        setScore(s => s + 1);
        return prev.map(x => x.id === id ? { ...x, active: false, feedback: 'hit' } : x);
      }
      return prev;
    });
    setTimeout(() => setMoles(p => p.map(m => m.id === id ? { ...m, feedback: null } : m)), 200);
  };

  const onEmptyClick = (id: number) => {
    if (status !== 'playing') return;
    const m = moles.find(x => x.id === id);
    if (!m?.active && !m?.feedback) {
      sfx.miss();
      setMoles(prev => prev.map(x => x.id === id ? { ...x, feedback: 'miss' } : x));
      setTimeout(() => setMoles(p => p.map(m => m.id === id ? { ...m, feedback: null } : m)), 200);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white font-inter flex flex-col items-center p-4 overflow-hidden relative">
      {/* Background Starfield */}
      <div className="fixed inset-0 pointer-events-none opacity-20 z-0">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="absolute bg-white rounded-full animate-pulse" 
            style={{ 
              width: Math.random() * 2 + 1 + 'px', 
              height: Math.random() * 2 + 1 + 'px', 
              top: Math.random() * 100 + '%', 
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's'
            }} 
          />
        ))}
      </div>

      {/* HUD */}
      <div className="w-full max-w-sm flex justify-between items-center bg-slate-900/40 backdrop-blur-xl border border-white/10 p-5 rounded-[2.5rem] mt-6 z-20 shadow-2xl">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Ejected</span>
          <span className="text-4xl font-orbitron font-black text-red-500 tabular-nums leading-none">{score}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Time</span>
          <span className={`text-4xl font-orbitron font-black tabular-nums leading-none ${timeLeft < 10 ? 'text-orange-500 animate-pulse' : 'text-white'}`}>
            0:{timeLeft.toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Record</span>
          <span className="text-4xl font-orbitron font-black text-cyan-400 tabular-nums leading-none">{highScore}</span>
        </div>
      </div>

      {/* Game Viewport */}
      <div className="flex-grow w-full max-w-sm flex items-center justify-center relative z-10">
        {status === 'idle' && (
          <div className="text-center z-30 animate-in fade-in zoom-in duration-700">
            <h1 className="text-6xl font-orbitron font-black tracking-tighter italic mb-4 leading-[0.8]">
              CREWMATE<br /><span className="text-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.7)]">CRUNCH</span>
            </h1>
            <p className="text-slate-400 text-xs mb-12 max-w-[220px] mx-auto font-bold uppercase tracking-[0.2em]">
              Clear the suspicious entities
            </p>
            <button onPointerDown={startGame} className="group relative">
              <div className="absolute -inset-1 bg-red-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-500" />
              <div className="relative bg-red-600 px-12 py-6 rounded-2xl text-2xl font-orbitron font-black uppercase tracking-widest shadow-2xl transition-all">
                Launch
              </div>
            </button>
          </div>
        )}

        {status === 'counting' && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <span className="text-[12rem] font-orbitron font-black text-white/5 animate-ping">
              {countdown}
            </span>
          </div>
        )}

        {(status === 'playing' || status === 'counting') && (
          <div className={`grid grid-cols-3 gap-3 w-full transition-all duration-700 ${status === 'counting' ? 'opacity-20 scale-90 blur-xl' : 'opacity-100 scale-100'}`}>
            {moles.map(m => (
              <div key={m.id} 
                className={`vent-hole aspect-square rounded-[2.5rem] border-4 transition-all duration-300 relative overflow-hidden vent-slats ${
                  m.feedback === 'hit' ? 'border-green-500 shadow-[0_0_35px_rgba(34,197,94,0.4)] scale-95' :
                  m.feedback === 'miss' ? 'border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.4)]' :
                  'border-slate-800'
                }`}
                onPointerDown={() => onEmptyClick(m.id)}
              >
                <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                <CrewmateVisual color={m.color} active={m.active} onWhack={() => onMoleWhack(m.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Overlay */}
      {status === 'ended' && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-full max-w-sm bg-[#0a0f18] border-t-[10px] border-red-600 rounded-[3rem] p-10 text-center shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-orbitron font-black text-white mb-8 italic uppercase tracking-tighter">Mission Debrief</h2>
            <div className="flex gap-4 mb-8">
              <div className="flex-1 bg-slate-900/60 p-6 rounded-3xl border border-white/5">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Ejected</p>
                <p className="text-5xl font-black text-white">{score}</p>
              </div>
              <div className="flex-1 bg-slate-900/60 p-6 rounded-3xl border border-white/5">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Record</p>
                <p className="text-5xl font-black text-cyan-400">{highScore}</p>
              </div>
            </div>
            <div className="bg-black/60 p-6 rounded-[2rem] border-l-4 border-red-500 text-left mb-10 min-h-[120px] flex items-center">
              {isGeneratingLog ? (
                <div className="w-full flex justify-center items-center py-4 space-x-2">
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce [animation-delay:0.1s]" />
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce [animation-delay:0.2s]" />
                </div>
              ) : (
                <p className="text-sm text-slate-300 italic font-semibold leading-relaxed">
                  <span className="text-red-500 font-black block text-[10px] uppercase mb-1 not-italic">Encrypted Report:</span>
                  "{securityLog}"
                </p>
              )}
            </div>
            <button onPointerDown={startGame} className="w-full bg-white text-black font-orbitron font-black py-6 rounded-2xl text-2xl shadow-xl transition-all hover:bg-slate-100">
              New Mission
            </button>
          </div>
        </div>
      )}

      <div className="py-6 text-[10px] font-black text-slate-800 tracking-[0.8em] uppercase z-10">
        Signal Secure // HQ-7
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}