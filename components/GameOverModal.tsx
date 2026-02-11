
import React, { useEffect, useState } from 'react';
import { getPostGameReport } from '../services/gemini';

interface GameOverModalProps {
  score: number;
  highScore: number;
  isNewHighscore: boolean;
  onRestart: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ score, highScore, isNewHighscore, onRestart }) => {
  const [report, setReport] = useState<string>("Scanning ship for survivors...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      const msg = await getPostGameReport(score, isNewHighscore);
      setReport(msg);
      setLoading(false);
    };
    fetchReport();
  }, [score, isNewHighscore]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-slate-900 border-4 border-red-600 rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
        <h2 className="text-4xl font-black text-white mb-2 font-orbitron uppercase tracking-tighter italic">Game Over</h2>
        
        <div className="space-y-4 my-6">
          <div>
            <p className="text-slate-400 text-sm uppercase tracking-widest font-bold">Crewmates Ejected</p>
            <p className="text-6xl font-black text-white">{score}</p>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Personal Best</p>
            <p className={`text-2xl font-bold ${isNewHighscore ? 'text-yellow-400' : 'text-slate-300'}`}>
              {highScore} {isNewHighscore && <span className="text-xs align-top">NEW!</span>}
            </p>
          </div>

          <div className="bg-black/40 p-4 rounded-xl italic text-sm text-sky-300 border-l-4 border-sky-500 min-h-[80px] flex items-center justify-center">
            {loading ? (
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            ) : (
              <p>"{report}"</p>
            )}
          </div>
        </div>

        <button 
          onClick={onRestart}
          className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black text-xl rounded-2xl shadow-[0_4px_0_rgb(153,27,27)] active:translate-y-1 active:shadow-none transition-all font-orbitron uppercase tracking-wide"
        >
          Restart Mission
        </button>
      </div>
    </div>
  );
};
