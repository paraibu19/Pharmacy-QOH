import { Medication, InventoryAudit } from '../types';

export const sharedDb = {
  async getMedications(): Promise<Medication[]> {
    const res = await fetch(`/api/medications?t=${Date.now()}`);
    return res.json();
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
    return res.json();
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
    return res.json();
  },

  async deleteMedication(id: string): Promise<void> {
    await fetch(`/api/medications/${id}`, { method: 'DELETE' });
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[], options: { photoStrategy: 'keep' | 'remove' } = { photoStrategy: 'keep' }): Promise<void> {
    await fetch('/api/medications/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: meds, options })
    });
  },

  async getAudits(): Promise<InventoryAudit[]> {
    const res = await fetch(`/api/audits?t=${Date.now()}`);
    return res.json();
  },

  async addAudit(audit: Omit<InventoryAudit, 'id' | 'auditedAt'>): Promise<InventoryAudit> {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audit)
    });
    return res.json();
  },

  async reset(): Promise<void> {
    await fetch('/api/system/reset', { method: 'POST' });
  }
};
