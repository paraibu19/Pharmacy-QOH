import { Medication, InventoryAudit } from '../types';

export const sharedDb = {
  async getMedications(): Promise<Medication[]> {
    const res = await fetch('/api/medications');
    return res.json();
  },

  async addMedication(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>): Promise<Medication> {
    const res = await fetch('/api/medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(med)
    });
    return res.json();
  },

  async updateMedication(id: string, data: Partial<Medication>): Promise<Medication> {
    const res = await fetch(`/api/medications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteMedication(id: string): Promise<void> {
    await fetch(`/api/medications/${id}`, { method: 'DELETE' });
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[]): Promise<void> {
    await fetch('/api/medications/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meds)
    });
  },

  async getAudits(): Promise<InventoryAudit[]> {
    const res = await fetch('/api/audits');
    return res.json();
  },

  async addAudit(audit: Omit<InventoryAudit, 'id' | 'auditedAt'>): Promise<InventoryAudit> {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audit)
    });
    return res.json();
  }
};
