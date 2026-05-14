import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function translateIndications(text: string, targetLanguages: string[], retries = 3): Promise<Record<string, string>> {
  const result = await batchTranslateIndications([{ id: 'single', text }], targetLanguages, retries);
  return result['single'] || {};
}

export async function batchTranslateIndications(
  items: { id: string, text: string }[], 
  targetLanguages: string[], 
  retries = 3
): Promise<Record<string, Record<string, string>>> {
  const validItems = items.filter(item => item.text && item.text.trim());
  if (validItems.length === 0) return {};
  
  let lastError: any = null;
  for (let i = 0; i < retries + 1; i++) {
    try {
      const prompt = `Translate the following medical drug indications from English to these languages: ${targetLanguages.join(', ')}.
      
      I will provide a list of items with their IDs and the English text. 
      Return a JSON object where the keys are the item IDs. 
      Each value should be another object where the keys are the language codes (${targetLanguages.join(', ')}) and the values are the translations.
      
      Items to translate:
      ${validItems.map(item => `ID: "${item.id}"\nText: "${item.text}"`).join('\n---\n')}
      
      Format your response like this:
      {
        "ID_1": {
          "hi": "...",
          "ur": "...",
          "ml": "...",
          "bn": "...",
          "tl": "..."
        },
        "ID_2": { ... }
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
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        console.warn(`Batch translation rate limited (429). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      
      const readableError = isRateLimit 
        ? "Translation quota exceeded (429). Please try again later." 
        : errorMsg.slice(0, 500);
      console.error("Batch translation failed:", readableError);
      break;
    }
  }
  
  return {};
}
