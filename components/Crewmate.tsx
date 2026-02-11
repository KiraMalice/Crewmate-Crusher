
import React from 'react';

interface CrewmateProps {
  color: string;
  active: boolean;
  onWhack: () => void;
}

export const Crewmate: React.FC<CrewmateProps> = ({ color, active, onWhack }) => {
  return (
    <div 
      className={`absolute inset-0 flex items-center justify-center transition-all duration-200 transform cursor-pointer ${
        active ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-full opacity-0 scale-50 pointer-events-none'
      }`}
      onClick={(e) => {
        if (active) {
          e.stopPropagation();
          onWhack();
        }
      }}
    >
      <div className="relative w-2/3 h-3/4 flex flex-col items-center">
        {/* Backpack */}
        <div 
          className="absolute -left-2 top-1/4 w-4 h-1/2 rounded-l-md" 
          style={{ backgroundColor: color, filter: 'brightness(0.8)' }}
        />
        
        {/* Main Body */}
        <div 
          className="w-full h-full rounded-t-full rounded-b-xl relative z-10 border-b-8 border-black/20"
          style={{ backgroundColor: color }}
        >
          {/* Visor */}
          <div className="absolute top-[20%] left-1/4 w-3/4 h-[30%] bg-sky-200 rounded-2xl border-4 border-black/40 overflow-hidden">
             <div className="absolute top-1 left-1 w-1/2 h-1/3 bg-white opacity-60 rounded-full" />
          </div>
        </div>

        {/* Legs (Simulated with clips/masking) */}
        <div className="flex justify-between w-full px-2 mt-[-10px] z-0">
          <div className="w-1/3 h-6 rounded-b-lg border-b-4 border-black/20" style={{ backgroundColor: color }} />
          <div className="w-1/3 h-6 rounded-b-lg border-b-4 border-black/20" style={{ backgroundColor: color }} />
        </div>
      </div>
    </div>
  );
};
