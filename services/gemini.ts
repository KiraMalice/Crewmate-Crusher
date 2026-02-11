
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getPostGameReport = async (score: number, isHighscore: boolean): Promise<string> => {
  try {
    const prompt = `The user just finished a whack-a-mole game where they were "ejecting" Among Us crewmates. 
    Score: ${score}. 
    New High Score: ${isHighscore ? 'Yes' : 'No'}.
    Write a short, funny, 2-sentence "Security Report" from the perspective of an Imposter or a Ship AI. 
    Keep it snarky and use Among Us terminology (sus, eject, vent, task, electrical).`;

    // Always use gemini-3-flash-preview for basic text tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.8,
        maxOutputTokens: 100,
      }
    });

    return response.text || "Report corrupted by communication interference in Electrical.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The crewmates are suspicious of your skill. Keep hunting.";
  }
};
