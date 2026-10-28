import { getFirestore } from 'firebase-admin/firestore';
import type { Project } from '../types';

const COLLECTION = 'projects';

function docToProject(id: string, data: FirebaseFirestore.DocumentData): Project {
  return {
    id,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    url: String(data.url ?? ''),
    description: typeof data.description === 'string' ? data.description : null,
    icon: typeof data.icon === 'string' ? data.icon : null,
    active: data.active === true,
    sort_order: typeof data.sort_order === 'number' ? data.sort_order : 0,
    visibility: data.visibility === 'public' ? 'public' : 'private'
  };
}

export async function listProjects(options: { includeInactive?: boolean; publicOnly?: boolean } = {}): Promise<Project[]> {
  const db = getFirestore();
  const snapshot = await db.collection(COLLECTION).orderBy('sort_order', 'asc').get();
  return snapshot.docs
    .map((doc) => docToProject(doc.id, doc.data()))
    .filter((project) => options.includeInactive || project.active)
    .filter((project) => !options.publicOnly || project.visibility === 'public')
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
}

export async function createProject(project: Omit<Project, 'id'>): Promise<Project> {
  const db = getFirestore();
  const reference = db.collection(COLLECTION).doc(project.slug);
  await reference.set(project);
  return docToProject(reference.id, (await reference.get()).data() ?? {});
}

export async function updateProject(id: string, project: Partial<Omit<Project, 'id'>>): Promise<Project | null> {
  const db = getFirestore();
  const reference = db.collection(COLLECTION).doc(id);
  if (!(await reference.get()).exists) return null;
  await reference.set(project, { merge: true });
  return docToProject(reference.id, (await reference.get()).data() ?? {});
}

export async function deactivateProject(id: string): Promise<boolean> {
  const db = getFirestore();
  const reference = db.collection(COLLECTION).doc(id);
  if (!(await reference.get()).exists) return false;
  await reference.update({ active: false });
  return true;
}
