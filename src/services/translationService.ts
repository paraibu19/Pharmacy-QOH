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

  // Deduplicate translation text to save tokens and request size
  const textToIds: Record<string, string[]> = {};
  validItems.forEach(item => {
    if (!textToIds[item.text]) textToIds[item.text] = [];
    textToIds[item.text].push(item.id);
  });

  const uniqueTexts = Object.keys(textToIds);
  const uniqueItems = uniqueTexts.map((text, idx) => ({ id: `unique_${idx}`, text }));
  
  let lastError: any = null;
  for (let i = 0; i < retries + 1; i++) {
    try {
      const prompt = `Translate the following medical drug indications from English to these languages: ${targetLanguages.join(', ')}.
      
      I will provide a list of items with their IDs and the English text. 
      Return a JSON object where the keys are the item IDs. 
      Each value should be another object where the keys are the language codes (${targetLanguages.join(', ')}) and the values are the translations.
      
      Items to translate:
      ${uniqueItems.map(item => `ID: "${item.id}"\nText: "${item.text}"`).join('\n---\n')}
      
      Format your response like this:
      {
        "unique_0": {
          "hi": "...",
          "ur": "...",
          "ml": "...",
          "bn": "...",
          "tl": "..."
        },
        "unique_1": { ... }
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      let responseText = response.text || '{}';
      // Clean markdown if present
      if (responseText.includes('```')) {
        responseText = responseText.replace(/```json\n?|```/g, '').trim();
      }
      
      try {
        const uniqueResults: Record<string, Record<string, string>> = JSON.parse(responseText);
        
        // Map back from unique results to original item IDs
        const finalResults: Record<string, Record<string, string>> = {};
        uniqueItems.forEach(uItem => {
          const trans = uniqueResults[uItem.id];
          if (trans) {
            textToIds[uItem.text].forEach(originalId => {
              finalResults[originalId] = trans;
            });
          }
        });

        return finalResults;
      } catch (parseError) {
        console.error("Failed to parse AI response as JSON:", responseText.slice(0, 200));
        throw new Error("AI response was not valid JSON");
      }
    } catch (error: any) {
      lastError = error;
      const errorMsg = error?.message || String(error);
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
      const isTransient = errorMsg.includes('500') || errorMsg.includes('503') || errorMsg.includes('Rpc failed') || errorMsg.includes('xhr error');
      
      if ((isRateLimit || isTransient) && i < retries) {
        const delay = Math.pow(2, i) * 3000 + Math.random() * 1000;
        console.warn(`Translation error (${isRateLimit ? '429' : 'Transient'}). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(delay);
        continue;
      }
      
      const readableError = isRateLimit 
        ? "Translation quota exceeded (429). Please try again later." 
        : isTransient 
          ? "The AI service is temporarily unavailable. Please try again in a moment."
          : errorMsg.slice(0, 500);
      console.error("Batch translation failed:", readableError);
      break;
    }
  }
  
  return {};
}
