import { PharmacyLocation, PHARMACY_NAMES } from './types';

export const LOCATIONS = [
  { id: PharmacyLocation.ADULT, name: PHARMACY_NAMES[PharmacyLocation.ADULT] },
  { id: PharmacyLocation.PEDIATRIC, name: PHARMACY_NAMES[PharmacyLocation.PEDIATRIC] },
  { id: PharmacyLocation.MESAIEED, name: PHARMACY_NAMES[PharmacyLocation.MESAIEED] }
];

export const NEW_ITEM_THRESHOLD_DAYS = 10;
