
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameStatus, CrewmateInfo, CREWMATE_COLORS } from './types.ts';
import { Crewmate } from './components/Crewmate.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { soundService } from './services/sounds.ts';

const GAME_DURATION = 60; // 1 minute in seconds
const GRID_SIZE = 9;
const INITIAL_COUNTDOWN = 3;
const FEEDBACK_DURATION = 300; // ms

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    highScore: Number(localStorage.getItem('crewmateHighScore')) || 0,
    timeLeft: GAME_DURATION,
    status: 'idle',
    isNewHighScore: false,
  });

  const [countdown, setCountdown] = useState(INITIAL_COUNTDOWN);

  const [moles, setMoles] = useState<CrewmateInfo[]>(
    Array.from({ length: GRID_SIZE }, (_, i) => ({
      id: i,
      active: false,
      color: CREWMATE_COLORS[0],
      isImposter: false,
      feedback: null,
    }))
  );

  const gameLoopRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Persistence of high score
  useEffect(() => {
    localStorage.setItem('crewmateHighScore', gameState.highScore.toString());
  }, [gameState.highScore]);

  const clearTimers = useCallback(() => {
    if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const startGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      score: 0,
      timeLeft: GAME_DURATION,
      status: 'counting',
      isNewHighScore: false,
    }));
    setCountdown(INITIAL_COUNTDOWN);
    setMoles(moles.map(m => ({ ...m, active: false, feedback: null })));
  }, [moles]);

  const quitGame = useCallback(() => {
    clearTimers();
    setGameState(prev => ({
      ...prev,
      status: 'idle',
      score: 0,
      timeLeft: GAME_DURATION
    }));
    setMoles(moles.map(m => ({ ...m, active: false, feedback: null })));
  }, [clearTimers, moles]);

  const endGame = useCallback(() => {
    setGameState(prev => {
      const isNew = prev.score > prev.highScore;
      return {
        ...prev,
        status: 'ended',
        highScore: isNew ? prev.score : prev.highScore,
        isNewHighScore: isNew,
      };
    });
    clearTimers();
  }, [clearTimers]);

  // Pre-game Countdown Logic
  useEffect(() => {
    if (gameState.status === 'counting') {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setGameState(g => ({ ...g, status: 'playing' }));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [gameState.status]);

  // Timer logic
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 1) {
            endGame();
            return { ...prev, timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState.status, gameState.timeLeft, endGame]);

  // Mole pop-up logic
  useEffect(() => {
    if (gameState.status === 'playing') {
      const spawnMole = () => {
        setMoles(prevMoles => {
          const inactiveIndices = prevMoles
            .map((m, i) => (!m.active ? i : -1))
            .filter(i => i !== -1);
          
          if (inactiveIndices.length === 0) return prevMoles;

          const randomIndex = inactiveIndices[Math.floor(Math.random() * inactiveIndices.length)];
          const newMoles = [...prevMoles];
          newMoles[randomIndex] = {
            ...newMoles[randomIndex],
            active: true,
            color: CREWMATE_COLORS[Math.floor(Math.random() * CREWMATE_COLORS.length)],
            feedback: null,
          };

          soundService.playPop();

          const difficultyMultiplier = Math.max(0.4, gameState.timeLeft / GAME_DURATION);
          const showDuration = (Math.random() * 800 + 700) * difficultyMultiplier;

          setTimeout(() => {
            setMoles(currMoles => {
              const mole = currMoles.find(m => m.id === randomIndex);
              // Only play hide sound if it was still active (not whacked)
              if (mole && mole.active) {
                soundService.playHide();
              }
              return currMoles.map((m, i) => i === randomIndex ? { ...m, active: false } : m);
            });
          }, showDuration);

          return newMoles;
        });
      };

      const spawnRate = Math.max(400, (gameState.timeLeft / GAME_DURATION) * 1200);
      gameLoopRef.current = setInterval(spawnMole, spawnRate);
    }

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [gameState.status, gameState.timeLeft]);

  const triggerFeedback = (id: number, type: 'hit' | 'miss') => {
    setMoles(prev => prev.map(m => m.id === id ? { ...m, feedback: type } : m));
    setTimeout(() => {
      setMoles(prev => prev.map(m => m.id === id ? { ...m, feedback: null } : m));
    }, FEEDBACK_DURATION);
  };

  const handleWhack = (id: number) => {
    if (gameState.status !== 'playing') return;
    
    setMoles(prev => prev.map(m => m.id === id ? { ...m, active: false } : m));
    setGameState(prev => ({ ...prev, score: prev.score + 1 }));
    soundService.playHit();
    triggerFeedback(id, 'hit');
  };

  const handleMiss = (id: number) => {
    if (gameState.status !== 'playing') return;
    const mole = moles.find(m => m.id === id);
    if (mole && !mole.active && !mole.feedback) {
      soundService.playMiss();
      triggerFeedback(id, 'miss');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0b0e14] text-white flex flex-col items-center justify-between p-4 pb-8 touch-none overflow-hidden">
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full animate-pulse" />
        <div className="absolute top-40 right-20 w-1 h-1 bg-white rounded-full" />
        <div className="absolute bottom-40 left-1/4 w-1.5 h-1.5 bg-white rounded-full animate-ping" />
        <div className="absolute top-2/3 right-1/3 w-2 h-2 bg-white rounded-full" />
      </div>

      {/* Header Stats */}
      <header className="w-full max-w-md flex justify-between items-center z-10 bg-slate-900/50 backdrop-blur-md p-4 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Score</span>
          <span className="text-3xl font-black font-orbitron text-red-500 leading-none">{gameState.score}</span>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time</span>
          <span className={`text-3xl font-black font-orbitron leading-none ${gameState.timeLeft < 15 ? 'text-orange-500 animate-pulse' : 'text-white'}`}>
            {formatTime(gameState.timeLeft)}
          </span>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">High</span>
          <span className="text-3xl font-black font-orbitron text-yellow-500 leading-none">{gameState.highScore}</span>
        </div>
      </header>

      {/* Game Board */}
      <main className="flex-grow flex items-center justify-center w-full max-w-md my-8 relative">
        {gameState.status === 'idle' ? (
          <div className="text-center animate-in zoom-in duration-500">
            <div className="relative mb-8 flex justify-center">
                <div className="scale-150 relative">
                    <Crewmate color="#C51111" active={true} onWhack={() => {}} />
                </div>
            </div>
            <h1 className="text-5xl font-black font-orbitron mb-4 text-white leading-tight">
                CREWMATE <br/> <span className="text-red-600">CRUNCH</span>
            </h1>
            <p className="text-slate-400 mb-8 max-w-[250px] mx-auto text-sm font-medium">
                The ship is crawling with crewmates doing tasks. Clear them out!
            </p>
            <button 
              onClick={startGame}
              className="px-12 py-6 bg-red-600 hover:bg-red-500 text-white font-black text-2xl rounded-2xl shadow-[0_6px_0_rgb(153,27,27)] active:translate-y-1 active:shadow-none transition-all font-orbitron uppercase tracking-widest"
            >
              Start Mission
            </button>
          </div>
        ) : (
          <div className="relative w-full">
            {gameState.status === 'counting' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <span className="text-9xl font-black font-orbitron text-red-600 animate-ping">
                  {countdown}
                </span>
              </div>
            )}
            <div className={`game-grid w-full transition-opacity duration-300 ${gameState.status === 'counting' ? 'opacity-30' : 'opacity-100'}`}>
              {moles.map((mole) => (
                <div 
                  key={mole.id} 
                  className={`hole transition-all duration-300 ${
                    mole.feedback === 'hit' ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)]' : 
                    mole.feedback === 'miss' ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]' : 
                    'border-slate-700'
                  }`}
                  onClick={() => handleMiss(mole.id)}
                >
                  <Crewmate 
                    color={mole.color} 
                    active={mole.active} 
                    onWhack={() => handleWhack(mole.id)} 
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Persistent CTA or Footer Info */}
      <footer className="w-full max-w-md flex flex-col items-center gap-4 z-10">
        {(gameState.status === 'playing' || gameState.status === 'counting') ? (
          <>
            <div className="bg-slate-900/80 px-4 py-2 rounded-full inline-block border border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-tighter">
              {gameState.status === 'counting' ? 'Initializing secure link...' : 'Target found: Eject immediately!'}
            </div>
            <button 
              onClick={quitGame}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl border border-slate-700 transition-colors uppercase tracking-widest"
            >
              Abort Mission
            </button>
          </>
        ) : (
            <div className="text-[10px] text-slate-600 uppercase tracking-[0.3em] font-bold">
                Project Skeld v1.0.4 - Secure Connection
            </div>
        )}
      </footer>

      {/* Modals */}
      {gameState.status === 'ended' && (
        <GameOverModal 
          score={gameState.score} 
          highScore={gameState.highScore} 
          isNewHighscore={gameState.isNewHighScore}
          onRestart={startGame}
        />
      )}
    </div>
  );
};

export default App;
