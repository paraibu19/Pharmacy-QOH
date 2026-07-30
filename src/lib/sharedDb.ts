import { Medication, InventoryAudit } from '../types';

export const sharedDb = {
  async getMedications(): Promise<Medication[]> {
    const res = await fetch(`/api/medications?t=${Date.now()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch medications (Status ${res.status}): ${text || res.statusText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response for medications: ${text.substring(0, 100)}`);
    }
  },

  async addMedication(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>): Promise<Medication> {
    const res = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(med)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Server failed to add medication: ${errText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response for adding medication: ${text.substring(0, 100)}`);
    }
  },

  async updateMedication(id: string, data: Partial<Medication>): Promise<Medication> {
    const res = await fetch(`/api/medications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Server failed to update medication: ${errText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response for updating medication: ${text.substring(0, 100)}`);
    }
  },

  async deleteMedication(id: string): Promise<void> {
    const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Server failed to delete medication: ${errText}`);
    }
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[], options: { photoStrategy: 'keep' | 'remove' } = { photoStrategy: 'keep' }): Promise<void> {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < meds.length; i += CHUNK_SIZE) {
      const chunk = meds.slice(i, i + CHUNK_SIZE);
      const res = await fetch('/api/medications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chunk, options })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server failed to bulk add medications (chunk ${i / CHUNK_SIZE + 1}): ${errText}`);
      }
    }
  },

  async getAudits(): Promise<InventoryAudit[]> {
    const res = await fetch(`/api/audits?t=${Date.now()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch audits (Status ${res.status}): ${text || res.statusText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response for audits: ${text.substring(0, 100)}`);
    }
  },

  async addAudit(audit: Omit<InventoryAudit, 'id' | 'auditedAt'>): Promise<InventoryAudit> {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audit)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Server failed to add audit: ${errText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response for adding audit: ${text.substring(0, 100)}`);
    }
  },

  async reset(): Promise<void> {
    const res = await fetch('/api/system/reset', { method: 'POST' });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Server failed to reset system: ${errText}`);
    }
  }
};
