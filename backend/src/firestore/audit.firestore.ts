import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export async function writeAuditLog(
  firebaseUid: string | null,
  action: string,
  ip: string
): Promise<void> {
  const db = getFirestore();
  await db.collection('audit_log').add({
    firebase_uid: firebaseUid,
    action,
    ip,
    created_at: FieldValue.serverTimestamp(),
  });
}
