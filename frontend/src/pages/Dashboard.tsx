// Removed ServerPanel import as it is no longer needed
  import { useEffect, useState } from 'react';
  import { apiRequest } from '../api/client';
  import { useAuth } from '../hooks/useAuth';
  import type { Project, Visibility } from '../types';

  type ProjectForm = Omit<Project, 'id' | 'description' | 'icon'> & {
    description: string;
    icon: string;
  };

  const emptyForm: ProjectForm = {
    name: '', slug: '', url: '', description: '', icon: '◆', sort_order: 0, active: true, visibility: 'private'
  };

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  export function Dashboard() {
    const { user, loading, logout } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [form, setForm] = useState<ProjectForm>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      if (!loading && !user) navigate('/login');
    }, [loading, user]);

    useEffect(() => {
      if (!user) return;
      void apiRequest<{ projects: Project[] }>('/projects?all=true')
        .then((response) => setProjects(response.projects))
        .catch((requestError: Error) => setError(requestError.message));
    }, [user]);

    if (loading || !user) return <main className="page"><p>Cargando sesión...</p></main>;

    const updateField = (field: keyof ProjectForm, value: string | number | boolean) => {
      setForm((current) => ({ ...current, [field]: value }));
    };

    const saveProject = async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError('');
      try {
        const response = editingId
          ? await apiRequest<{ project: Project }>(`/projects/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
          : await apiRequest<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(form) });
        setProjects((current) => editingId
          ? current.map((project) => project.id === editingId ? response.project : project)
          : [...current, response.project]);
        setForm(emptyForm);
        setEditingId(null);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar la tarjeta');
      } finally {
        setBusy(false);
      }
    };

    const editProject = (project: Project) => {
      setEditingId(project.id);
      setForm({ ...project, description: project.description ?? '', icon: project.icon ?? '' });
    };

    const patchProject = async (project: Project, patch: Partial<Project>) => {
      try {
        const response = await apiRequest<{ project: Project }>(`/projects/${project.id}`, {
          method: 'PUT', body: JSON.stringify(patch)
        });
        setProjects((current) => current.map((item) => item.id === project.id ? response.project : item));
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar la tarjeta');
      }
    };

    return (
      <main className="page page-dashboard">
        <section className="dashboard-top">
          <div><span className="eyebrow">Dashboard</span><h1>Gestionar tarjetas</h1><p>{user.email}</p></div>
          <button className="ghost" onClick={async () => { await logout(); navigate('/login'); }}>Cerrar sesión</button>
        </section>
        {error && <p className="error-message" role="alert">{error}</p>}
        <form className="project-form" onSubmit={saveProject}>
          <h2>{editingId ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
          <input required placeholder="Nombre" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
          <input required placeholder="Slug" value={form.slug} onChange={(event) => updateField('slug', event.target.value)} />
          <input required type="url" placeholder="URL" value={form.url} onChange={(event) => updateField('url', event.target.value)} />
          <input placeholder="Descripción" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
          <input placeholder="Icono" value={form.icon} onChange={(event) => updateField('icon', event.target.value)} />
          <input required type="number" min="0" placeholder="Orden" value={form.sort_order} onChange={(event) => updateField('sort_order', Number(event.target.value))} />
          <label><input type="checkbox" checked={form.active} onChange={(event) => updateField('active', event.target.checked)} /> Activa</label>
          <select value={form.visibility} onChange={(event) => updateField('visibility', event.target.value as Visibility)}><option value="public">Público</option><option value="private">Privado</option></select>
          <button type="submit" disabled={busy}>{busy ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear tarjeta'}</button>
          {editingId && <button type="button" className="ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancelar</button>}
        </form>
        <section className="projects-section"><h2>Tarjetas</h2><div className="projects-list">
          {projects.map((project) => <div className="project-row" key={project.id}>
            <span>{project.icon ?? '◌'}</span><div><strong>{project.name}</strong><p>{project.description ?? 'Sin descripción'}</p></div>
            <span className={project.active ? 'status ok' : 'status danger'}>{project.active ? 'Activa' : 'Inactiva'}</span>
            <span>{project.visibility === 'public' ? 'Público' : 'Privado'}</span>
            <button onClick={() => editProject(project)}>Editar</button>
            <button onClick={() => void patchProject(project, { visibility: project.visibility === 'public' ? 'private' : 'public' })}>Cambiar visibilidad</button>
            <button onClick={() => void patchProject(project, { active: !project.active })}>{project.active ? 'Desactivar' : 'Activar'}</button>
          </div>)}
        </div></section>
      </main>
    );
}
