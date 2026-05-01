export enum PharmacyLocation {
  ADULT = 'adult-emergency',
  PEDIATRIC = 'pediatric',
  MESAIEED = 'mesaieed-opd'
}

export const PHARMACY_NAMES: Record<PharmacyLocation, string> = {
  [PharmacyLocation.ADULT]: 'Aw-Adult Emergency Pharmacy',
  [PharmacyLocation.PEDIATRIC]: 'Aw-Pediatric Pharmacy',
  [PharmacyLocation.MESAIEED]: 'Aw-Mesaieed OPD Pharmacy'
};

export interface Medication {
  id: string;
  itemCode: string;
  itemName: string;
  qoh: number;
  expiration1: string;
  expiration2: string;
  expiration3: string;
  locationId: PharmacyLocation;
  addedAt: string;
  lastUpdatedAt: string;
  updatedBy?: string;
  minQty?: number;
  maxQty?: number;
  isNew?: boolean; // UI helper
}

export interface InventoryAudit {
  id: string;
  itemCode: string;
  locationId: PharmacyLocation;
  physicalCount: number;
  recordedQoh: number;
  variance: number;
  auditedAt: string;
  auditedBy: string;
  itemName?: string; // Denormalized for display
}
