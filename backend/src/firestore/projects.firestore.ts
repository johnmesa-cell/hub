import { getFirestore } from 'firebase-admin/firestore';
import type { Project } from '../types';

const COLLECTION = 'projects';

function docToProject(id: string, data: FirebaseFirestore.DocumentData): Project {
  return {
    id,
    name: data.name,
    slug: data.slug,
    url: data.url,
    description: data.description ?? null,
    icon: data.icon ?? null,
    active: data.active === true,
    sort_order: data.sort_order ?? 0,
  };
}

export async function listProjects(includeInactive = false): Promise<Project[]> {
  const db = getFirestore();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION).orderBy('sort_order', 'asc');
  if (!includeInactive) {
    query = query.where('active', '==', true);
  }
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => docToProject(doc.id, doc.data()));
}

export async function getProjectByDocId(docId: string): Promise<Project | null> {
  const db = getFirestore();
  const doc = await db.collection(COLLECTION).doc(docId).get();
  if (!doc.exists) return null;
  return docToProject(doc.id, doc.data()!);
}

export async function createProject(data: Omit<Project, 'id'>): Promise<Project> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(data.slug);
  await docRef.set({
    name: data.name,
    slug: data.slug,
    url: data.url,
    description: data.description ?? null,
    icon: data.icon ?? null,
    active: data.active,
    sort_order: data.sort_order,
  });
  return docToProject(docRef.id, await docRef.get().then((d) => d.data()!));
}

export async function updateProject(
  docId: string,
  data: Partial<Omit<Project, 'id'>>
): Promise<Project | null> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(docId);
  const existing = await docRef.get();
  if (!existing.exists) return null;
  await docRef.update(data as FirebaseFirestore.UpdateData<Project>);
  return docToProject(docId, (await docRef.get()).data()!);
}

export async function deactivateProject(docId: string): Promise<boolean> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(docId);
  const existing = await docRef.get();
  if (!existing.exists) return false;
  await docRef.update({ active: false });
  return true;
}
