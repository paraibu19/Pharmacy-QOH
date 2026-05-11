import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function translateIndications(text: string, targetLanguages: string[]): Promise<Record<string, string>> {
  if (!text) return {};
  
  try {
    const prompt = `Translate the following medical drug indications from English to these languages: ${targetLanguages.join(', ')}.
    Return a JSON object where the keys are the language codes and the values are the translations.
    
    Indications: "${text}"
    
    Languages:
    - hi (Hindi)
    - ur (Urdu)
    - ml (Malayalam)
    - bn (Bengali)
    - tl (Tagalog)
    
    Format:
    {
      "hi": "...",
      "ur": "...",
      "ml": "...",
      "bn": "...",
      "tl": "..."
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Translation failed:", error);
    return {};
  }
}
