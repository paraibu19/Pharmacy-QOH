export async function translateIndications(text: string, targetLanguages: string[], retries = 3): Promise<Record<string, string>> {
  try {
    const result = await batchTranslateIndications([{ id: 'single', text }], targetLanguages, retries);
    return result['single'] || {};
  } catch (err) {
    console.warn("Individual translation failed, saving with empty multi-language fields:", err);
    return {};
  }
}

export async function batchTranslateIndications(
  items: { id: string, text: string }[], 
  targetLanguages: string[], 
  retries = 3
): Promise<Record<string, Record<string, string>>> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, targetLanguages })
  });
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Translation request failed with status ${res.status}`);
  }
  
  return await res.json();
}
