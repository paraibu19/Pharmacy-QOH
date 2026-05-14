import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function translateIndications(text: string, targetLanguages: string[], retries = 3): Promise<Record<string, string>> {
  if (!text) return {};
  
  let lastError: any = null;
  for (let i = 0; i < retries + 1; i++) {
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
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimit && i < retries) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Translation rate limited (429). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      
      const readableError = isRateLimit 
        ? "Translation quota exceeded (429). Please try again later." 
        : errorMsg.slice(0, 500);
      console.error("Translation failed:", readableError);
      break;
    }
  }
  
  return {};
}
