
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
type GameStatus = 'idle' | 'counting' | 'playing' | 'ended';

interface CrewmateInfo {
  id: number;
  active: boolean;
  color: string;
  feedback: 'hit' | 'miss' | null;
}

const CREWMATE_COLORS = [
  '#C51111', '#132ED1', '#117F2D', '#ED54BA', '#EF7D0D', 
  '#F5F557', '#3F474E', '#D6E0F0', '#6B2FBB', '#71491E', '#38FEDB', '#50EF39'
];

// --- Audio Service ---
class GameAudio {
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

  hit() { this.playTone(150, 'square', 0.1, 0.2, 40); }
  miss() { this.playTone(100, 'sine', 0.2, 0.1, 50); }
  pop() { this.playTone(200, 'sine', 0.1, 0.05, 600); }
  tick() { this.playTone(800, 'sine', 0.05, 0.02); }
  start() { this.playTone(400, 'triangle', 0.3, 0.1, 800); }
}

const audio = new GameAudio();

// --- Components ---

const Crewmate: React.FC<{ color: string; active: boolean; onWhack: () => void }> = ({ color, active, onWhack }) => (
  <div 
    className={`absolute inset-0 flex items-center justify-center transition-all duration-200 transform cursor-pointer ${
      active ? 'translate-y-2 opacity-100 scale-100' : 'translate-y-full opacity-0 scale-75 pointer-events-none'
    }`}
    onClick={(e) => { e.stopPropagation(); onWhack(); }}
  >
    <div className="relative w-2/3 h-4/5 flex flex-col items-center">
      <div className="absolute -left-2 top-1/4 w-5 h-1/2 rounded-l-lg" style={{ backgroundColor: color, filter: 'brightness(0.7)' }} />
      <div className="w-full h-full rounded-t-[40%] rounded-b-xl relative z-10 border-b-8 border-black/30" style={{ backgroundColor: color }}>
        <div className="absolute top-[20%] left-[15%] w-[80%] h-[28%] bg-sky-200 rounded-2xl border-4 border-black/40 overflow-hidden shadow-inner">
           <div className="absolute top-1 left-1 w-1/2 h-1/3 bg-white/60 rounded-full" />
        </div>
      </div>
      <div className="flex justify-between w-full px-1 -mt-4 z-0">
        <div className="w-[38%] h-8 rounded-b-xl" style={{ backgroundColor: color, filter: 'brightness(0.9)' }} />
        <div className="w-[38%] h-8 rounded-b-xl" style={{ backgroundColor: color, filter: 'brightness(0.9)' }} />
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [highScore, setHighScore] = useState(() => Number(localStorage.getItem('crewmate_hs')) || 0);
  const [moles, setMoles] = useState<CrewmateInfo[]>(Array.from({ length: 9 }, (_, i) => ({ id: i, active: false, color: CREWMATE_COLORS[0], feedback: null })));
  const [countdown, setCountdown] = useState(3);
  const [report, setReport] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);

  const timerRef = useRef<number | null>(null);
  const spawnRef = useRef<number | null>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY }), []);

  const generateReport = async (finalScore: number) => {
    setLoadingReport(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `User got a score of ${finalScore} in an Among Us Whack-a-Mole game. Write a 2-sentence snarky security report as if from the Ship's AI or an Imposter. Use slang like sus, vent, and tasks.`,
      });
      setReport(response.text || "Scanning complete. No survivors detected.");
    } catch (e) {
      setReport("The security logs were wiped by an Imposter in Electrical.");
    } finally {
      setLoadingReport(false);
    }
  };

  const endGame = useCallback(() => {
    setStatus('ended');
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('crewmate_hs', score.toString());
    }
    generateReport(score);
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
  }, [score, highScore]);

  const startGame = () => {
    setScore(0);
    setTimeLeft(45);
    setCountdown(3);
    setReport("");
    setStatus('counting');
    audio.start();
  };

  useEffect(() => {
    if (status === 'counting') {
      const id = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(id);
            setStatus('playing');
            return 0;
          }
          audio.tick();
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(id);
    }
  }, [status]);

  useEffect(() => {
    if (status === 'playing') {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            endGame();
            return 0;
          }
          if (t < 6) audio.tick();
          return t - 1;
        });
      }, 1000);

      const spawn = () => {
        setMoles(prev => {
          const inactive = prev.filter(m => !m.active);
          if (inactive.length === 0) return prev;
          const target = inactive[Math.floor(Math.random() * inactive.length)];
          
          audio.pop();
          
          // Auto-hide logic
          const duration = Math.max(500, 1200 * (timeLeft / 45));
          setTimeout(() => {
            setMoles(curr => curr.map(m => m.id === target.id ? { ...m, active: false } : m));
          }, duration);

          return prev.map(m => m.id === target.id ? { ...m, active: true, color: CREWMATE_COLORS[Math.floor(Math.random() * CREWMATE_COLORS.length)] } : m);
        });
      };

      const spawnRate = Math.max(350, 800 * (timeLeft / 45));
      spawnRef.current = window.setInterval(spawn, spawnRate);
      
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (spawnRef.current) clearInterval(spawnRef.current);
      };
    }
  }, [status, timeLeft, endGame]);

  const handleWhack = (id: number) => {
    if (status !== 'playing') return;
    setMoles(prev => {
      const mole = prev.find(m => m.id === id);
      if (mole?.active) {
        audio.hit();
        setScore(s => s + 1);
        return prev.map(m => m.id === id ? { ...m, active: false, feedback: 'hit' } : m);
      }
      return prev;
    });
    setTimeout(() => setMoles(p => p.map(m => m.id === id ? { ...m, feedback: null } : m)), 300);
  };

  const handleMiss = (id: number) => {
    if (status !== 'playing') return;
    const mole = moles.find(m => m.id === id);
    if (!mole?.active && !mole?.feedback) {
      audio.miss();
      setMoles(prev => prev.map(m => m.id === id ? { ...m, feedback: 'miss' } : m));
      setTimeout(() => setMoles(p => p.map(m => m.id === id ? { ...m, feedback: null } : m)), 300);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#05070a] flex flex-col items-center p-4 pt-safe-top overflow-hidden font-inter">
      {/* Background Starfield */}
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="absolute bg-white rounded-full animate-pulse" 
            style={{ 
              width: Math.random() * 3 + 'px', 
              height: Math.random() * 3 + 'px', 
              top: Math.random() * 100 + '%', 
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's'
            }} 
          />
        ))}
      </div>

      {/* Header */}
      <div className="w-full max-w-md z-20 flex justify-between items-center bg-slate-900/40 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl mb-8">
        <div>
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Ejected</p>
          <p className="text-4xl font-black font-orbitron text-red-500 tabular-nums">{score}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Signal</p>
          <p className={`text-4xl font-black font-orbitron tabular-nums transition-colors ${timeLeft < 10 ? 'text-orange-500 animate-pulse' : 'text-white'}`}>
            0:{timeLeft.toString().padStart(2, '0')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Record</p>
          <p className="text-4xl font-black font-orbitron text-cyan-400 tabular-nums">{highScore}</p>
        </div>
      </div>

      {/* Game Board */}
      <div className="relative flex-grow w-full max-w-md flex items-center justify-center">
        {status === 'idle' && (
          <div className="text-center animate-in fade-in zoom-in duration-500 z-30">
            <h1 className="text-6xl font-black font-orbitron italic mb-4 tracking-tighter leading-none">
              CREWMATE<br /><span className="text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">CRUNCH</span>
            </h1>
            <p className="text-slate-400 text-sm mb-10 max-w-[280px] mx-auto leading-relaxed">
              Identify and eject suspicious entities immediately. The ship's safety is in your hands.
            </p>
            <button onClick={startGame} className="group relative">
              <div className="absolute -inset-1 bg-red-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />
              <div className="relative px-12 py-6 bg-red-600 rounded-2xl font-black text-2xl font-orbitron uppercase tracking-widest shadow-xl transform transition hover:scale-105 active:scale-95">
                Start Mission
              </div>
            </button>
          </div>
        )}

        {status === 'counting' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <span className="text-[12rem] font-black font-orbitron text-white/20 animate-ping">
              {countdown}
            </span>
          </div>
        )}

        {(status === 'playing' || status === 'counting') && (
          <div className={`grid grid-cols-3 gap-3 w-full transition-opacity duration-500 ${status === 'counting' ? 'opacity-20' : 'opacity-100'}`}>
            {moles.map(m => (
              <div key={m.id} 
                className={`vent-hole aspect-square rounded-[2rem] border-4 transition-all duration-300 relative overflow-hidden ${
                  m.feedback === 'hit' ? 'border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.4)]' :
                  m.feedback === 'miss' ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' :
                  'border-slate-800'
                }`}
                onClick={() => handleMiss(m.id)}
              >
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                <Crewmate color={m.color} active={m.active} onWhack={() => handleWhack(m.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {status === 'ended' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-slate-900 border-t-4 border-red-600 rounded-[2.5rem] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black font-orbitron mb-8 text-white uppercase italic tracking-tighter">Mission Summary</h2>
            
            <div className="mb-8 flex justify-center space-x-6">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5 flex-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Score</p>
                <p className="text-4xl font-black text-white">{score}</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/5 flex-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Best</p>
                <p className="text-4xl font-black text-cyan-400">{highScore}</p>
              </div>
            </div>

            <div className="bg-black/60 p-5 rounded-2xl border-l-4 border-red-500 text-left mb-10 min-h-[100px] flex items-center">
              {loadingReport ? (
                <div className="w-full flex justify-center py-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce mx-1" />
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce mx-1 delay-75" />
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce mx-1 delay-150" />
                </div>
              ) : (
                <p className="text-sm text-slate-300 italic leading-relaxed">"{report}"</p>
              )}
            </div>

            <button onClick={startGame} className="w-full py-5 bg-white text-black font-black font-orbitron text-xl rounded-2xl shadow-lg transform transition active:scale-95">
              RE-DEPLOY
            </button>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <div className="mt-8 z-20 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
        Signal Encryption: 0xSkeld_v2.0
      </div>
    </div>
  );
};

// --- Mount ---
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
