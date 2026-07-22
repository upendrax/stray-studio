// App-side IDs: UUIDv4 via the Workers-native crypto (no extra dependency).
// Stored as text primary keys; see db/schema.ts conventions.
export const newId = (): string => crypto.randomUUID();
