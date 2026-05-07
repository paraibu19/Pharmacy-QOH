# Firebase Security Specification - Pharmacy Inventory System

## 1. Data Invariants
- **Medications**: Every medication must have a unique `itemCode`. Only admins can create or update medications.
- **Inventory Audits**: Every audit must link to a valid `itemCode`. Only admins can create audits.

## 2. The "Dirty Dozen" Payloads (Deny Cases)
1. **Unauthenticated Write**: Attempting to create a medication without being logged in.
2. **Identity Spoofing**: Attempting to set `updatedBy` to a UID other than the current user's.
3. **Invalid Data Type**: Sending a `qoh` as a string instead of a number.
4. **Huge Payload**: Attempting to save a 2MB string in `itemName`.
5. **Unauthorized Field Update**: A pharmacist trying to change `qoh` (if we had restricted keys, but currently write is admin-only).
6. **Self-Promotion**: A regular user trying to add themselves to the `admins` collection.
7. **Invalid Enum**: Setting `locationId` to "unknown-location".
8. **Missing Required Fields**: Creating a medication without `itemCode`.
9. **Bypassing Terminal State**: (Not applicable yet as we don't have terminal states, but we will protect all fields).
10. **Resource Poisoning**: Using a 1KB string as a document ID.
11. **PII Leakage**: (Not applicable, no PII stored).
12. **Orphaned Writes**: Creating an audit for a medication that doesn't exist.

## 3. Test Runner (Mock)
See `firestore.rules.test.ts` (conceptual).
