'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  TASK_COLUMNS,
  type Project,
  type Task,
  type TaskColumn,
  type VerificationStatus,
} from '@/src/lib/types';

const columnLabels: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  'in-progress': 'In Progress',
  verification: 'Verification',
  done: 'Done',
};

const columnCollisionDetection: CollisionDetection = (args) => {
  const columnContainers = args.droppableContainers.filter((container) =>
    String(container.id).startsWith('column:'),
  );
  const columnArgs = { ...args, droppableContainers: columnContainers };
  return pointerWithin(columnArgs).length > 0
    ? pointerWithin(columnArgs)
    : closestCorners(columnArgs);
};

type ApiError = Error & { issues?: Record<string, string> };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      issues?: Record<string, string>;
    };
    const error = new Error(body.error || 'Request failed.') as ApiError;
    error.issues = body.issues;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function checkpointText(task: Task) {
  if (task.checkpointState === 'not_captured') return 'Not captured';
  if (task.checkpointState === 'not_git') return 'Not a Git repository';
  if (task.checkpointState === 'error') return 'Capture failed';
  const sha = task.gitSha?.slice(0, 7) ?? 'unknown';
  return `${task.gitBranch ?? 'detached'} · ${sha}${task.gitDirty ? ' · dirty' : ''}`;
}

function firstLine(value: string) {
  return value.split('\n').find((line) => line.trim())?.trim() || value;
}

function taskPayload(task: Task) {
  return {
    title: task.title,
    task: task.task,
    progress: task.progress,
    decisions: task.decisions,
    verificationStatus: task.verificationStatus,
    verificationNotes: task.verificationNotes,
  };
}

const emptyTask = {
  title: '',
  task: '',
  progress: '',
  decisions: 'No decisions yet.',
  verificationStatus: 'not_run' as VerificationStatus,
  verificationNotes: 'Not run yet: task has not started.',
};

function TaskCard({
  task,
  onOpen,
  overlay = false,
}: {
  task: Task;
  onOpen?: (task: Task) => void;
  overlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: overlay });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const summaryLabel = task.column === 'done' ? 'Outcome' : 'Next action';

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`task-card${isDragging ? ' is-dragging' : ''}${overlay ? ' drag-overlay' : ''}`}
      onClick={() => onOpen?.(task)}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-topline">
        <span className="task-reference">{task.reference}</span>
        <GripVertical aria-hidden="true" size={14} className="drag-grip" />
      </div>
      <h3>{task.title}</h3>
      <p className="task-summary">
        <strong>{summaryLabel}</strong>
        <span>{firstLine(task.progress)}</span>
      </p>
      <div className="task-card-meta">
        {task.column === 'verification' ? (
          <span className={`verification-mark ${task.verificationStatus}`}>
            {task.verificationStatus.replace('_', ' ')}
          </span>
        ) : task.column === 'done' ? (
          <span className="verification-mark passed">
            <CheckCircle2 aria-hidden="true" size={12} /> Verified
          </span>
        ) : (
          <span className="checkpoint-mini">
            <GitCommitHorizontal aria-hidden="true" size={12} />
            {checkpointText(task)}
          </span>
        )}
        <span>{new Date(task.updatedAt).toLocaleDateString()}</span>
      </div>
    </article>
  );
}

function BoardColumn({
  column,
  tasks,
  onOpen,
}: {
  column: TaskColumn;
  tasks: Task[];
  onOpen: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column}` });
  return (
    <section
      ref={setNodeRef}
      className={`board-column column-${column}${isOver ? ' is-over' : ''}`}
      aria-labelledby={`heading-${column}`}
    >
      <header className="column-header">
        <div className="column-title">
          <span className="route-node" aria-hidden="true" />
          <h2 id={`heading-${column}`}>{columnLabels[column]}</h2>
        </div>
        <span className="column-count">{tasks.length}</span>
      </header>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="task-stack">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && <p className="column-empty">Drop a task here</p>}
        </div>
      </SortableContext>
    </section>
  );
}

function ProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { project } = await api<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, repoPath }),
      });
      setName('');
      setRepoPath('');
      onCreated(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="project-dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <h2>Add a local project</h2>
            <p>Register an existing directory. Agent Kanban only reads its Git state.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
        <label>
          Project name
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>
        <label>
          Local directory path
          <input
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="/Users/you/projects/example"
            required
          />
        </label>
        {error && <p className="form-error" role="alert"><CircleAlert size={15} /> {error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving && <LoaderCircle className="spin" aria-hidden="true" size={15} />}
            Add project
          </button>
        </div>
      </form>
    </dialog>
  );
}

function TaskDrawer({
  project,
  task,
  creating,
  onClose,
  onSaved,
  onDeleted,
  onMoved,
}: {
  project: Project;
  task: Task | null;
  creating: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
  onMoved: (task: Task) => void;
}) {
  const [form, setForm] = useState(() => task ? taskPayload(task) : emptyTask);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const open = true;

  useEffect(() => {
    const timeout = window.setTimeout(() => titleRef.current?.focus(), 60);
    return () => window.clearTimeout(timeout);
  }, []);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = creating
        ? `/api/projects/${project.id}/tasks`
        : `/api/tasks/${task?.id}`;
      const { task: saved } = await api<{ task: Task }>(url, {
        method: creating ? 'POST' : 'PATCH',
        body: JSON.stringify(form),
      });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save task.');
    } finally {
      setSaving(false);
    }
  }

  async function captureCheckpoint() {
    if (!task) return;
    setCapturing(true);
    setError('');
    try {
      const { task: updated } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/checkpoint`,
        { method: 'POST' },
      );
      onSaved(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checkpoint capture failed.');
    } finally {
      setCapturing(false);
    }
  }

  async function move(offset: number) {
    if (!task) return;
    const index = TASK_COLUMNS.indexOf(task.column);
    const destination = TASK_COLUMNS[index + offset];
    if (!destination) return;
    setError('');
    try {
      const { task: moved } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/move`,
        { method: 'POST', body: JSON.stringify({ column: destination }) },
      );
      onMoved(moved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move task.');
    }
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted(task.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close task editor"
        className={`drawer-scrim${open ? ' is-open' : ''}`}
        onClick={onClose}
      />
      <aside className={`task-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <form onSubmit={save}>
          <header className="drawer-header">
            <div>
              <p>{creating ? 'New task' : `${task?.reference} · ${task ? columnLabels[task.column] : ''}`}</p>
              <h2>{creating ? 'Create a handoff record' : task?.title}</h2>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close task editor">
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="drawer-body">
            <label>
              Title
              <input
                ref={titleRef}
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                placeholder="A concise card title"
                required
              />
            </label>
            <label>
              Task and acceptance criteria
              <textarea
                value={form.task}
                onChange={(event) => setField('task', event.target.value)}
                placeholder="Desired outcome and how completion will be judged"
                rows={4}
                required
              />
            </label>
            <label>
              Progress and next action
              <textarea
                value={form.progress}
                onChange={(event) => setField('progress', event.target.value)}
                placeholder="Put the immediate next action first"
                rows={4}
                required
              />
            </label>
            <label>
              Decisions
              <textarea
                value={form.decisions}
                onChange={(event) => setField('decisions', event.target.value)}
                rows={3}
                required
              />
            </label>
            <div className="verification-fields">
              <label>
                Verification result
                <select
                  value={form.verificationStatus}
                  onChange={(event) => setField('verificationStatus', event.target.value as VerificationStatus)}
                >
                  <option value="not_run">Not run</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="partial">Partial</option>
                </select>
              </label>
              <label>
                Verification notes
                <textarea
                  value={form.verificationNotes}
                  onChange={(event) => setField('verificationNotes', event.target.value)}
                  rows={3}
                  required
                />
              </label>
            </div>

            {!creating && task && (
              <section className="checkpoint-panel">
                <div>
                  <h3>Git checkpoint</h3>
                  <p>{checkpointText(task)}</p>
                  {task.checkpointCapturedAt && (
                    <span>Captured {new Date(task.checkpointCapturedAt).toLocaleString()}</span>
                  )}
                  {task.checkpointError && <span className="checkpoint-error">{task.checkpointError}</span>}
                </div>
                <button type="button" className="secondary-button" onClick={captureCheckpoint} disabled={capturing}>
                  <RefreshCw className={capturing ? 'spin' : ''} aria-hidden="true" size={14} />
                  Capture
                </button>
              </section>
            )}

            {error && <p className="form-error" role="alert"><CircleAlert size={15} /> {error}</p>}

            {!creating && task && (
              <div className="delete-zone">
                {confirmDelete ? (
                  <div><span>Delete this task permanently?</span><button type="button" onClick={remove}>Yes, delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" size={14} /> Delete task</button>
                )}
              </div>
            )}
          </div>

          <footer className="drawer-footer">
            {!creating && task ? (
              <div className="move-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => move(-1)}
                  disabled={task.column === 'backlog'}
                >
                  <ArrowLeft aria-hidden="true" size={14} /> Previous
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => move(1)}
                  disabled={task.column === 'done'}
                >
                  Next <ArrowRight aria-hidden="true" size={14} />
                </button>
              </div>
            ) : <span />}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving && <LoaderCircle className="spin" aria-hidden="true" size={15} />}
              {creating ? 'Create task' : 'Save changes'}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const drawerTask = tasks.find((task) => task.id === drawerTaskId) ?? null;
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? null;

  const loadTasks = useCallback(async (projectId: string) => {
    const result = await api<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
    setTasks(result.tasks);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ projects: Project[] }>('/api/projects')
      .then(async (result) => {
        if (cancelled) return;
        setProjects(result.projects);
        const remembered = window.localStorage.getItem('agent-kanban-project');
        const first = result.projects.find((project) => project.id === remembered) ?? result.projects[0];
        if (first) {
          setSelectedProjectId(first.id);
          await loadTasks(first.id);
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the board.'))
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [loadTasks]);

  useEffect(() => {
    if (!selectedProjectId) return;
    const interval = window.setInterval(() => {
      loadTasks(selectedProjectId).catch(() => {
        // Foreground actions surface errors; background refresh stays quiet.
      });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [loadTasks, selectedProjectId]);

  async function chooseProject(projectId: string) {
    setSelectedProjectId(projectId);
    window.localStorage.setItem('agent-kanban-project', projectId);
    setLoading(true);
    setError('');
    try {
      await loadTasks(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load project tasks.');
    } finally {
      setLoading(false);
    }
  }

  function replaceTask(updated: Task) {
    setTasks((current) => {
      const exists = current.some((task) => task.id === updated.id);
      return exists
        ? current.map((task) => (task.id === updated.id ? updated : task))
        : [...current, updated];
    });
    setDrawerTaskId(updated.id);
    setCreatingTask(false);
  }

  function targetColumn(event: DragEndEvent) {
    if (!event.over) return null;
    const overId = String(event.over.id);
    if (overId.startsWith('column:')) return overId.slice(7) as TaskColumn;
    return tasks.find((task) => task.id === overId)?.column ?? null;
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const dragged = tasks.find((task) => task.id === String(event.active.id));
    const destination = targetColumn(event);
    if (!dragged || !destination || dragged.column === destination) return;
    const snapshot = tasks;
    setTasks((current) => current.map((task) => task.id === dragged.id ? { ...task, column: destination } : task));
    setNotice('');
    setError('');
    try {
      const { task } = await api<{ task: Task }>(`/api/tasks/${dragged.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ column: destination }),
      });
      replaceTask(task);
      setDrawerTaskId(null);
      setNotice(`${task.title} moved to ${columnLabels[destination]}.`);
    } catch (caught) {
      setTasks(snapshot);
      setError(caught instanceof Error ? caught.message : 'Could not move task.');
    }
  }

  const grouped = useMemo(
    () => Object.fromEntries(
      TASK_COLUMNS.map((column) => [
        column,
        tasks.filter((task) => task.column === column).sort((a, b) => a.position - b.position),
      ]),
    ) as Record<TaskColumn, Task[]>,
    [tasks],
  );

  const checkpoint = tasks.find((task) => task.checkpointState === 'captured');

  return (
    <main className="app-shell">
      <section className="app-window" aria-label="Agent Kanban">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="brand-copy"><strong>Agent Kanban</strong><span>Local handoff desk</span></span>
          </div>

          {selectedProject ? (
            <label className="project-picker">
              <FolderGit2 aria-hidden="true" size={16} />
              <span><strong>{selectedProject.name}</strong><small>{selectedProject.repoPath}</small></span>
              <select value={selectedProjectId} onChange={(event) => chooseProject(event.target.value)} aria-label="Switch project">
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" size={14} />
            </label>
          ) : <div />}

          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={() => setProjectDialogOpen(true)} aria-label="Add project">
              <Settings2 aria-hidden="true" size={17} />
            </button>
            <button className="primary-button" type="button" disabled={!selectedProject} onClick={() => setCreatingTask(true)}>
              <Plus aria-hidden="true" size={16} /> New task
            </button>
          </div>
        </header>

        {selectedProject && (
          <div className="context-rail">
            <div className="repo-state">
              <GitBranch aria-hidden="true" size={14} />
              <strong>{checkpoint?.gitBranch ?? 'Checkpoint not captured'}</strong>
              {checkpoint && <span className={checkpoint.gitDirty ? 'dirty-state' : 'clean-state'}>{checkpoint.gitDirty ? 'Dirty' : 'Clean'}</span>}
              {checkpoint?.gitSha && <code>{checkpoint.gitSha.slice(0, 7)}</code>}
            </div>
            <span>Drag a card to move it · click to inspect the handoff</span>
          </div>
        )}

        {error && <div className="global-message error-message" role="alert"><CircleAlert size={16} /> {error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
        {notice && <div className="global-message success-message" role="status"><CheckCircle2 size={16} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></div>}

        {loading ? (
          <div className="loading-state"><LoaderCircle className="spin" aria-hidden="true" /><p>Loading local board…</p></div>
        ) : !selectedProject ? (
          <div className="first-run-state">
            <div className="first-run-route" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <h1>Connect your first local project</h1>
            <p>Register a repository directory to create its board. Git access stays read-only and all task data stays on this machine.</p>
            <button className="primary-button" onClick={() => setProjectDialogOpen(true)}><Plus size={16} /> Add project</button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={columnCollisionDetection}
            onDragStart={(event: DragStartEvent) => setActiveTaskId(String(event.active.id))}
            onDragCancel={() => setActiveTaskId(null)}
            onDragEnd={onDragEnd}
          >
            <div className="board">
              {TASK_COLUMNS.map((column) => (
                <BoardColumn
                  key={column}
                  column={column}
                  tasks={grouped[column]}
                  onOpen={(task) => setDrawerTaskId(task.id)}
                />
              ))}
            </div>
            <DragOverlay>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
          </DndContext>
        )}
      </section>

      <ProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={(project) => {
          setProjects((current) => [...current, project]);
          setProjectDialogOpen(false);
          chooseProject(project.id);
        }}
      />

      {selectedProject && (creatingTask || drawerTask) && (
        <TaskDrawer
          key={creatingTask ? 'new-task' : drawerTask?.id}
          project={selectedProject}
          task={drawerTask}
          creating={creatingTask}
          onClose={() => { setDrawerTaskId(null); setCreatingTask(false); }}
          onSaved={replaceTask}
          onDeleted={(taskId) => { setTasks((current) => current.filter((task) => task.id !== taskId)); setDrawerTaskId(null); }}
          onMoved={replaceTask}
        />
      )}
    </main>
  );
}
