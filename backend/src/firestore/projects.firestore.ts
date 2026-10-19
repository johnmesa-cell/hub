import * as admin from 'firebase-admin';
import type { Project } from '../types';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const firestore = admin.firestore();
const projectsCollection = firestore.collection('projects');

function docToProject(snapshot: admin.firestore.DocumentSnapshot): Project {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
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
  const snapshot = await projectsCollection.get();
  return snapshot.docs
    .map(docToProject)
    .filter((project) => options.includeInactive || project.active)
    .filter((project) => !options.publicOnly || project.visibility === 'public')
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
}

export async function createProject(project: Omit<Project, 'id'>): Promise<Project> {
  const reference = await projectsCollection.add(project);
  return docToProject(await reference.get());
}

export async function updateProject(id: string, project: Partial<Omit<Project, 'id'>>): Promise<Project | undefined> {
  const reference = projectsCollection.doc(id);
  if (!(await reference.get()).exists) return undefined;
  await reference.set(project, { merge: true });
  return docToProject(await reference.get());
}

export async function deactivateProject(id: string): Promise<boolean> {
  const reference = projectsCollection.doc(id);
  if (!(await reference.get()).exists) return false;
  await reference.update({ active: false });
  return true;
}

export async function writeAuditLog(firebaseUid: string | null, action: string, ip: string): Promise<void> {
  await firestore.collection('audit_log').add({ firebaseUid, action, ip, createdAt: admin.firestore.FieldValue.serverTimestamp() });
}