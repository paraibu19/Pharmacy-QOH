import { Medication, InventoryAudit } from '../types';
import { storage } from './storage';

const MEDS_KEY = 'aw_pharmacy_medications';
const AUDITS_KEY = 'aw_pharmacy_audits';

export const localDb = {
  getMedications(): Medication[] {
    const data = storage.getItem(MEDS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveMedications(meds: Medication[]) {
    storage.setItem(MEDS_KEY, JSON.stringify(meds));
    // Trigger custom event for multi-tab sync or re-renders
    window.dispatchEvent(new Event('local-storage-update'));
  },

  getAudits(): InventoryAudit[] {
    const data = storage.getItem(AUDITS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveAudits(audits: InventoryAudit[]) {
    storage.setItem(AUDITS_KEY, JSON.stringify(audits));
  },

  addMedication(med: Omit<Medication, 'id'>): Medication {
    const meds = this.getMedications();
    const newMed: Medication = {
      ...med,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    } as Medication;
    meds.push(newMed);
    this.saveMedications(meds);
    this.updateLastUpdateTime();
    return newMed;
  },

  updateMedication(id: string, data: Partial<Medication>) {
    const meds = this.getMedications();
    const index = meds.findIndex(m => m.id === id);
    if (index !== -1) {
      meds[index] = { ...meds[index], ...data, lastUpdatedAt: new Date().toISOString() };
      this.saveMedications(meds);
      this.updateLastUpdateTime();
    }
  },

  deleteMedication(id: string) {
    const meds = this.getMedications();
    const filtered = meds.filter(m => m.id !== id);
    this.saveMedications(filtered);
    this.updateLastUpdateTime();
  },

  bulkAdd(newMeds: Omit<Medication, 'id'>[]) {
    const meds = this.getMedications();
    const added = newMeds.map(m => ({
      ...m,
      id: Math.random().toString(36).substring(2, 15),
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    })) as Medication[];
    meds.push(...added);
    this.saveMedications(meds);
    this.updateLastUpdateTime();
  },

  getLastUpdateTime(): string | null {
    return storage.getItem('aw_pharmacy_last_update');
  },

  updateLastUpdateTime() {
    const now = new Date().toISOString();
    storage.setItem('aw_pharmacy_last_update', now);
    window.dispatchEvent(new Event('local-storage-update'));
  }

};
