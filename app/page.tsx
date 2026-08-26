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
  Eye,
  EyeOff,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
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
  type Feature,
  type Project,
  type Task,
  type TaskColumn,
  type VerificationStatus,
} from '@/src/lib/types';

type Workspace = 'board' | 'features';
type BoardColumn = TaskColumn;
type FeaturesDocument = {
  exists: boolean;
  path: string;
  markdown: string | null;
  features: Feature[];
};

const columns: BoardColumn[] = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
  'done',
  'canceled',
];
const movableColumns: TaskColumn[] = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
];
const labels: Record<BoardColumn, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  'in-progress': 'In Progress',
  verification: 'Verification',
  done: 'Done',
  canceled: 'Canceled',
};
const emptyTask = {
  title: '',
  task: '',
  progress: '',
  decisions: 'No decisions yet.',
  verificationStatus: 'not_run' as VerificationStatus,
  verificationNotes: 'Not run yet: task has not started.',
  featureId: '',
};

function directoryBasename(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, '');
  const basename = normalized.split(/[\\/]/).filter(Boolean).pop();
  return basename === '~' ? '' : basename || '';
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error || 'Request failed.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function checkpointText(task: Task) {
  if (task.checkpointState === 'not_captured') return 'Not captured';
  if (task.checkpointState === 'not_git') return 'Not a Git repository';
  if (task.checkpointState === 'error') return 'Capture failed';
  return `${task.gitBranch ?? 'detached'} · ${task.gitSha?.slice(0, 7) ?? 'unknown'}${task.gitDirty ? ' · dirty' : ''}`;
}

function featureKey(feature: Feature) {
  return `${feature.index}:${feature.id ?? 'unassigned'}`;
}

function featureLabel(feature: Feature) {
  return feature.id ? `${feature.id} · ${feature.title}` : feature.title;
}

function TaskCard({
  task,
  features,
  onOpen,
  overlay = false,
}: {
  task: Task;
  features: Feature[];
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
  } = useSortable({
    id: task.id,
    disabled: overlay || !movableColumns.includes(task.column),
  });
  const feature = features.find((item) => item.id === task.featureId);
  const progress =
    task.progress.trim() ||
    (task.createdBy === 'human'
      ? 'No next action recorded yet.'
      : 'No next action recorded.');

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-card${isDragging ? ' is-dragging' : ''}${overlay ? ' drag-overlay' : ''}${task.column === 'canceled' ? ' is-canceled' : ''}`}
      onClick={() => onOpen?.(task)}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-topline">
        <span className="task-reference">{task.reference}</span>
        {movableColumns.includes(task.column) && (
          <GripVertical aria-hidden="true" size={14} className="drag-grip" />
        )}
      </div>
      <h3>{task.title}</h3>
      {feature && (
        <span className="feature-tag">{feature.id || 'Ungroomed feature'}</span>
      )}
      <p className="task-summary">
        <strong>
          {task.column === 'done'
            ? 'Outcome'
            : task.column === 'canceled'
              ? 'Cancellation'
              : 'Next action'}
        </strong>
        <span>
          {task.column === 'canceled'
            ? task.cancellationReason || 'Canceled by the project owner.'
            : progress.split('\n')[0]}
        </span>
      </p>
      <div className="task-card-meta">
        {task.column === 'verification' ? (
          <span className={`verification-mark ${task.verificationStatus}`}>
            {task.verificationStatus.replace('_', ' ')}
          </span>
        ) : task.column === 'done' ? (
          <span className="verification-mark passed">
            <CheckCircle2 size={12} />
            Reviewed
          </span>
        ) : (
          <span className="checkpoint-mini">
            <GitCommitHorizontal size={12} />
            {checkpointText(task)}
          </span>
        )}
        <span>{new Date(task.updatedAt).toLocaleDateString()}</span>
      </div>
    </article>
  );
}

function BoardColumnView({
  column,
  tasks,
  features,
  onOpen,
  droppable,
}: {
  column: BoardColumn;
  tasks: Task[];
  features: Feature[];
  onOpen: (task: Task) => void;
  droppable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column}`,
    disabled: !droppable,
  });
  const emptyCopy =
    column === 'verification'
      ? 'Ready for human review'
      : column === 'done'
        ? 'No reviewed tasks'
        : 'No tasks here';
  return (
    <section
      ref={setNodeRef}
      className={`board-column column-${column}${isOver ? ' is-over' : ''}`}
      aria-labelledby={`heading-${column}`}
    >
      <header className="column-header">
        <div className="column-title">
          <span className="route-node" />
          <h2 id={`heading-${column}`}>{labels[column]}</h2>
        </div>
        <span className="column-count">{tasks.length}</span>
      </header>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="task-stack">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              features={features}
              onOpen={onOpen}
            />
          ))}
          {!tasks.length && <p className="column-empty">{emptyCopy}</p>}
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
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function resetAndClose() {
    setName('');
    setRepoPath('');
    setNameTouched(false);
    setError('');
    onClose();
  }
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
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
      setNameTouched(false);
      onCreated(project);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not add project.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog ref={dialogRef} className="project-dialog" onClose={resetAndClose}>
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div>
            <h2>Import local directory</h2>
            <p>
              Choose a new or existing directory. Agent Kanban creates it when
              needed, then checks its requirements.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={resetAndClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>
        <label>
          Local directory path
          <span className="field-note">
            New directories are created; existing directories are imported.
          </span>
          <input
            value={repoPath}
            onChange={(event) => {
              const nextPath = event.target.value;
              setRepoPath(nextPath);
              if (!nameTouched) setName(directoryBasename(nextPath));
            }}
            autoFocus
            required
            placeholder="/path/to/project"
          />
        </label>
        <label>
          Project name
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            <CircleAlert size={15} />
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={resetAndClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={saving || !name.trim() || !repoPath.trim()}
          >
            {saving && <LoaderCircle className="spin" size={15} />}Import
            directory
          </button>
        </div>
      </form>
    </dialog>
  );
}

function TaskDrawer({
  project,
  task,
  features,
  creating,
  onClose,
  onSaved,
  onDeleted,
}: {
  project: Project;
  task: Task | null;
  features: Feature[];
  creating: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState(() =>
    task
      ? {
          title: task.title,
          task: task.task,
          progress: task.progress,
          decisions: task.decisions,
          verificationStatus: task.verificationStatus,
          verificationNotes: task.verificationNotes,
          featureId: task.featureId || '',
        }
      : emptyTask,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const humanTask = creating || task?.createdBy === 'human';
  useEffect(() => {
    const id = window.setTimeout(() => titleRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);
  function setField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { task: saved } = await api<{ task: Task }>(
        creating
          ? `/api/projects/${project.id}/tasks`
          : `/api/tasks/${task?.id}`,
        {
          method: creating ? 'POST' : 'PATCH',
          body: JSON.stringify({
            ...form,
            featureId: form.featureId || undefined,
            ...(creating ? { createdBy: 'human' } : {}),
          }),
        },
      );
      onSaved(saved);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save task.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function move(offset: number) {
    if (!task) return;
    const next = movableColumns[movableColumns.indexOf(task.column) + offset];
    if (!next) return;
    try {
      const { task: moved } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/move`,
        { method: 'POST', body: JSON.stringify({ column: next }) },
      );
      onSaved(moved);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not move task.',
      );
    }
  }
  async function capture() {
    if (!task) return;
    setCapturing(true);
    try {
      const { task: updated } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/checkpoint`,
        { method: 'POST' },
      );
      onSaved(updated);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Checkpoint capture failed.',
      );
    } finally {
      setCapturing(false);
    }
  }
  async function complete() {
    if (!task) return;
    setSaving(true);
    setError('');
    try {
      const { task: completed } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/complete`,
        { method: 'POST' },
      );
      onSaved(completed);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Review could not complete this task. Resolve the verification and checkpoint requirements, then try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!task) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted(task.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not delete task.',
      );
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close task editor"
        className="drawer-scrim is-open"
        onClick={onClose}
      />
      <aside className="task-drawer is-open">
        <form onSubmit={save}>
          <header className="drawer-header">
            <div>
              <p>
                {creating
                  ? 'New human task'
                  : `${task?.reference} · ${task ? labels[task.column] : ''}`}
              </p>
              <h2>{creating ? 'Create a handoff record' : task?.title}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close task editor"
            >
              <X size={18} />
            </button>
          </header>
          <div className="drawer-body">
            <label>
              Title
              <input
                ref={titleRef}
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                required
              />
            </label>
            <label>
              Task and acceptance criteria
              <textarea
                value={form.task}
                onChange={(event) => setField('task', event.target.value)}
                rows={4}
                required
              />
            </label>
            {creating ? (
              <label>
                Feature
                <select
                  value={form.featureId}
                  onChange={(event) =>
                    setField('featureId', event.target.value)
                  }
                >
                  <option value="">No parent feature</option>
                  {features
                    .filter((feature) => feature.status !== 'canceled')
                    .map((feature) => (
                      <option
                        key={featureKey(feature)}
                        value={feature.id ?? ''}
                        disabled={!feature.id}
                      >
                        {featureLabel(feature)}
                      </option>
                    ))}
                </select>
              </label>
            ) : task?.featureId ? (
              <div className="read-only-field">
                <span>Parent feature</span>
                <strong>
                  {features.find((feature) => feature.id === task.featureId)
                    ? featureLabel(
                        features.find(
                          (feature) => feature.id === task.featureId,
                        )!,
                      )
                    : task.featureId}
                </strong>
              </div>
            ) : null}
            <label>
              Progress and next action
              <textarea
                value={form.progress}
                onChange={(event) => setField('progress', event.target.value)}
                placeholder={
                  humanTask
                    ? 'Optional until work begins'
                    : 'Put the immediate next action first'
                }
                rows={4}
                required={!humanTask}
              />
              {humanTask && (
                <span className="field-note">
                  Optional for human-created tasks. Add it when work starts.
                </span>
              )}
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
                  onChange={(event) =>
                    setField(
                      'verificationStatus',
                      event.target.value as VerificationStatus,
                    )
                  }
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
                  onChange={(event) =>
                    setField('verificationNotes', event.target.value)
                  }
                  rows={3}
                  required
                />
              </label>
            </div>
            {task && (
              <section className="checkpoint-panel">
                <div>
                  <h3>Git checkpoint</h3>
                  <p>{checkpointText(task)}</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={capture}
                  disabled={capturing}
                >
                  <RefreshCw className={capturing ? 'spin' : ''} size={14} />
                  Capture
                </button>
              </section>
            )}
            {task?.column === 'verification' && (
              <section className="review-zone">
                <h3>Human review</h3>
                <p>
                  Completion is a human action. The app validates the
                  verification result and Git checkpoint before moving this task
                  to Done.
                </p>
                {confirmComplete ? (
                  <div className="inline-confirm">
                    <span>Mark this reviewed task Done?</span>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={complete}
                      disabled={saving}
                    >
                      Confirm completion
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setConfirmComplete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setConfirmComplete(true)}
                  >
                    <CheckCircle2 size={15} />
                    Review and complete
                  </button>
                )}
              </section>
            )}
            {error && (
              <p className="form-error" role="alert">
                <CircleAlert size={15} />
                {error}
              </p>
            )}
            {task && (
              <div className="delete-zone">
                {confirmDelete ? (
                  <div>
                    <span>Delete this task permanently?</span>
                    <button type="button" onClick={remove}>
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep task
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={14} />
                    Delete task
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="drawer-footer">
            {task && movableColumns.includes(task.column) ? (
              <div className="move-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => move(-1)}
                  disabled={task.column === 'backlog'}
                >
                  <ArrowLeft size={14} />
                  Previous
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => move(1)}
                  disabled={task.column === 'verification'}
                >
                  Next
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <span />
            )}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={15} />}
              {creating ? 'Create task' : 'Save changes'}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

function FeaturesWorkspace({
  project,
  document,
  tasks,
  loading,
  error,
  refresh,
  refreshTasks,
  onDocument,
  onProject,
  onNotice,
}: {
  project: Project;
  document: FeaturesDocument | null;
  tasks: Task[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  onDocument: (document: FeaturesDocument) => void;
  onProject: (project: Project) => void;
  onNotice: (notice: string) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [creatingFeature, setCreatingFeature] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const selected =
    document?.features.find((feature) => feature.index === selectedIndex) ??
    document?.features[0] ??
    null;
  function choose(feature: Feature) {
    setSelectedIndex(feature.index);
    setDraftTitle(feature.title);
    setDraft(feature.body);
    setCreatingFeature(false);
    setEditing(false);
    setConfirm(null);
  }
  function beginEdit() {
    if (!selected) return;
    setDraftTitle(selected.title);
    setDraft(selected.body);
    setEditing(true);
  }
  function beginCreate() {
    setDraftTitle('');
    setDraft('');
    setCreatingFeature(true);
    setEditing(false);
    setConfirm(null);
    setActionError('');
  }
  async function saveFile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      const { project: updatedProject, features } = await api<{
        project: Project;
        features: FeaturesDocument;
      }>(`/api/projects/${project.id}/features-file`, {
        method: 'PUT',
        body: JSON.stringify({ markdown: draft }),
      });
      onProject(updatedProject);
      onDocument(features);
      onNotice('FEATURES.md saved locally.');
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : 'Could not save FEATURES.md.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function confirmFile() {
    setSaving(true);
    setActionError('');
    try {
      const { project: updatedProject, features } = await api<{
        project: Project;
        features: FeaturesDocument;
      }>(`/api/projects/${project.id}/features-file`, { method: 'POST' });
      onProject(updatedProject);
      onDocument(features);
      onNotice('FEATURES.md confirmed. The project is ready for grooming.');
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : 'Could not confirm FEATURES.md.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function refreshFile() {
    setActionError('');
    await refresh();
  }
  async function saveFeature(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api<{ feature: Feature }>(
        `/api/projects/${project.id}/features/${selected.index}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title: draftTitle, body: draft }),
        },
      );
      await refresh();
      setEditing(false);
      onNotice('Feature updated in FEATURES.md.');
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Could not update feature.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function createFeature(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    try {
      const { feature } = await api<{ feature: Feature }>(
        `/api/projects/${project.id}/features`,
        {
          method: 'POST',
          body: JSON.stringify({ title: draftTitle, body: draft }),
        },
      );
      await refresh();
      setSelectedIndex(feature.index);
      setCreatingFeature(false);
      setEditing(false);
      onNotice('New feature added to FEATURES.md.');
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Could not create feature.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function mutate(action: 'cancel' | 'delete') {
    if (!selected) return;
    setSaving(true);
    try {
      if (action === 'cancel')
        await api<{ feature: Feature }>(
          `/api/projects/${project.id}/features/${selected.index}`,
          {
            method: 'POST',
            body: JSON.stringify({
              action: 'cancel',
              reason: cancelReason,
            }),
          },
        );
      else
        await api(`/api/projects/${project.id}/features/${selected.index}`, {
          method: 'DELETE',
        });
      if (action === 'cancel') await Promise.all([refresh(), refreshTasks()]);
      else await refresh();
      setConfirm(null);
      setCancelReason('');
      onNotice(
        action === 'cancel'
          ? 'Feature canceled and linked tasks moved to Canceled.'
          : 'Feature permanently deleted.',
      );
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : `Could not ${action} feature.`,
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="features-loading">
        <LoaderCircle className="spin" />
        <p>Reading local requirements…</p>
      </div>
    );
  if (document?.exists && project.featuresConfirmedAt === null)
    return (
      <section className="features-onboarding features-confirmation">
        <div className="file-path">
          <strong>FEATURES.md found</strong>
          <code>{document.path}</code>
        </div>
        <h1>Confirm these requirements.</h1>
        <p>
          We found {document.features.length} detected{' '}
          {document.features.length === 1 ? 'feature' : 'features'} in this
          local file. Review it, then confirm that it is the project’s source of
          truth.
        </p>
        <div className="feature-file-preview" aria-label="FEATURES.md preview">
          <div>
            <strong>Read-only preview</strong>
            <span>{document.features.length} detected</span>
          </div>
          <pre>{document.markdown || 'This FEATURES.md file is empty.'}</pre>
        </div>
        {(actionError || error) && (
          <p className="form-error" role="alert">
            <CircleAlert size={15} />
            {actionError || error}
          </p>
        )}
        <div className="onboarding-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void refreshFile()}
            disabled={saving}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={confirmFile}
            disabled={saving}
          >
            {saving && <LoaderCircle className="spin" size={15} />}
            Use this FEATURES.md
          </button>
        </div>
      </section>
    );
  if (!document?.exists)
    return (
      <section className="features-onboarding">
        <div className="file-path">
          <strong>FEATURES.md required</strong>
          <code>{document?.path || `${project.repoPath}/FEATURES.md`}</code>
        </div>
        <h1>Bring the requirements into the workspace.</h1>
        <p>
          FEATURES.md is the single source of truth. Agents can read and groom
          it, but only the human UI can write it.
        </p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void refreshFile()}
          disabled={saving}
        >
          <RefreshCw size={15} />
          Refresh for external file
        </button>
        <form onSubmit={saveFile} className="features-file-form">
          <label>
            Paste FEATURES.md
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={16}
              placeholder={
                '## Feature title\nDescribe the user need, intended behavior, and acceptance criteria.'
              }
              required
            />
          </label>
          {(actionError || error) && (
            <p className="form-error">
              <CircleAlert size={15} />
              {actionError || error}
            </p>
          )}
          <button
            type="submit"
            className="primary-button"
            disabled={saving || !draft.trim()}
          >
            <Save size={15} />
            Save FEATURES.md
          </button>
        </form>
      </section>
    );
  if (!selected && !creatingFeature)
    return (
      <section className="features-empty">
        <h1>No features yet</h1>
        <p>
          {document.path} is connected but has no level-two headings. Add the
          first feature to begin grooming requirements in order.
        </p>
        <button type="button" className="primary-button" onClick={beginCreate}>
          <Plus size={16} />
          Add feature
        </button>
      </section>
    );
  const linked = selected
    ? tasks.filter((task) => task.featureId === selected.id)
    : [];
  return (
    <div className="features-workspace">
      <aside className="feature-list" aria-label="Features in document order">
        <div className="feature-list-header">
          <div>
            <h1>Features</h1>
            <p>{document.path}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={beginCreate}
            aria-label="Add feature"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="feature-list-items">
          {document.features.map((feature) => (
            <button
              type="button"
              key={featureKey(feature)}
              className={`feature-row${feature.index === selected?.index ? ' is-selected' : ''}${feature.status === 'canceled' ? ' is-canceled' : ''}`}
              onClick={() => choose(feature)}
            >
              <span className="feature-order">
                {feature.id || 'UNASSIGNED'}
              </span>
              <strong>{feature.title}</strong>
              <span className={`feature-status status-${feature.status}`}>
                {feature.status === 'active' && !feature.id
                  ? 'Needs grooming'
                  : feature.status}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="feature-inspector">
        {creatingFeature ? (
          <>
            <header className="inspector-header">
              <div>
                <h1>Create a feature</h1>
                <div className="feature-facts">
                  <span className="feature-id">
                    ID assigned during grooming
                  </span>
                </div>
              </div>
            </header>
            <form onSubmit={createFeature} className="feature-editor">
              <label>
                Feature title
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  autoFocus
                  required
                />
              </label>
              <label>
                Requirements and acceptance criteria
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={14}
                />
              </label>
              <div className="editor-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreatingFeature(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving || !draftTitle.trim()}
                >
                  <Save size={15} />
                  Add to FEATURES.md
                </button>
              </div>
            </form>
            {actionError && (
              <p className="form-error" role="alert">
                <CircleAlert size={15} />
                {actionError}
              </p>
            )}
          </>
        ) : selected ? (
          <>
            <header className="inspector-header">
              <div>
                <h1>{selected.title}</h1>
                <div className="feature-facts">
                  <span className="feature-id">
                    {selected.id || 'ID pending approval'}
                  </span>
                  <span className={`feature-status status-${selected.status}`}>
                    {selected.status === 'active' && !selected.id
                      ? 'Needs grooming'
                      : selected.status}
                  </span>
                  <span>
                    {linked.length} linked{' '}
                    {linked.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
              </div>
              <div className="inspector-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={refresh}
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
                {selected.status !== 'canceled' && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={editing ? () => setEditing(false) : beginEdit}
                  >
                    {editing ? 'Discard draft' : 'Edit feature'}
                  </button>
                )}
              </div>
            </header>
            {selected.status === 'canceled' ? (
              <div className="canceled-feature-note">
                <strong>Feature canceled</strong>
                <p>
                  {selected.metadata.cancellationReason ||
                    'Linked work is retained in the Canceled column.'}
                </p>
              </div>
            ) : editing ? (
              <form onSubmit={saveFeature} className="feature-editor">
                <label>
                  Feature title
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Feature content
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={14}
                  />
                </label>
                <div className="editor-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    <Save size={15} />
                    Save to FEATURES.md
                  </button>
                </div>
              </form>
            ) : (
              <article className="feature-content">
                <pre>
                  {selected.body ||
                    'No detail recorded yet. Add the requirement, scope, and acceptance criteria before grooming this feature.'}
                </pre>
              </article>
            )}
            <section className="linked-tasks">
              <header>
                <h2>Linked tasks</h2>
                <span>{linked.length}</span>
              </header>
              {linked.length ? (
                <ul>
                  {linked.map((task) => (
                    <li key={task.id}>
                      <div>
                        <strong>
                          {task.reference} · {task.title}
                        </strong>
                        <span>
                          {task.progress || 'No next action recorded yet.'}
                        </span>
                      </div>
                      <em>{labels[task.column]}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {!selected.id
                    ? 'No tasks yet. An agent grooms one feature at a time and waits for your approval before creating them.'
                    : 'No linked tasks yet.'}
                </p>
              )}
            </section>
            {selected.status !== 'canceled' && (
              <footer className="feature-danger-zone">
                {confirm === 'cancel' ? (
                  <div className="inline-confirm">
                    <span>
                      Cancel this feature and move {linked.length} linked task
                      {linked.length === 1 ? '' : 's'} to Canceled?
                    </span>
                    <label className="cancel-reason-field">
                      Reason
                      <textarea
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(event.target.value)
                        }
                        placeholder="Why is this feature no longer in scope?"
                        rows={3}
                        required
                      />
                    </label>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => mutate('cancel')}
                      disabled={saving || !cancelReason.trim()}
                    >
                      Confirm cancellation
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setConfirm(null)}
                    >
                      Keep feature
                    </button>
                  </div>
                ) : confirm === 'delete' ? (
                  <div className="inline-confirm">
                    <span>
                      Delete this feature permanently? It has no linked tasks.
                    </span>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => mutate('delete')}
                    >
                      Delete feature
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setConfirm(null)}
                    >
                      Keep feature
                    </button>
                  </div>
                ) : linked.length ? (
                  <button
                    type="button"
                    className="text-danger-button"
                    onClick={() => setConfirm('cancel')}
                  >
                    Cancel feature
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-danger-button"
                    onClick={() => setConfirm('delete')}
                  >
                    Delete feature
                  </button>
                )}
              </footer>
            )}
            {(actionError || error) && (
              <p className="form-error" role="alert">
                <CircleAlert size={15} />
                {actionError || error}
              </p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [document, setDocument] = useState<FeaturesDocument | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>('board');
  const [loading, setLoading] = useState(true);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const project = projects.find((item) => item.id === selectedId) ?? null;
  const requirementsPending = project?.featuresConfirmedAt === null;
  const drawerTask = tasks.find((task) => task.id === drawerId) ?? null;
  const activeTask = tasks.find((task) => task.id === activeId) ?? null;
  const loadTasks = useCallback(
    async (id: string) =>
      setTasks(
        (await api<{ tasks: Task[] }>(`/api/projects/${id}/tasks`)).tasks,
      ),
    [],
  );
  const loadFeatures = useCallback(async (id: string) => {
    setFeaturesLoading(true);
    setDocument(null);
    try {
      const { features } = await api<{ features: FeaturesDocument }>(
        `/api/projects/${id}/features`,
      );
      setDocument(features);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load FEATURES.md.',
      );
    } finally {
      setFeaturesLoading(false);
    }
  }, []);
  useEffect(() => {
    api<{ projects: Project[] }>('/api/projects')
      .then(async ({ projects: listed }) => {
        setProjects(listed);
        const first =
          listed.find(
            (item) =>
              item.id === window.localStorage.getItem('agent-kanban-project'),
          ) ?? listed[0];
        if (first) {
          setSelectedId(first.id);
          if (first.featuresConfirmedAt === null) setWorkspace('features');
          await Promise.all([loadTasks(first.id), loadFeatures(first.id)]);
        }
      })
      .catch((caught) =>
        setError(
          caught instanceof Error ? caught.message : 'Could not load board.',
        ),
      )
      .finally(() => setLoading(false));
  }, [loadFeatures, loadTasks]);
  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      loadTasks(selectedId).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [loadTasks, selectedId]);
  async function chooseProject(id: string, target?: Project) {
    setSelectedId(id);
    window.localStorage.setItem('agent-kanban-project', id);
    const nextProject = target ?? projects.find((item) => item.id === id);
    if (nextProject?.featuresConfirmedAt === null) setWorkspace('features');
    setTasks([]);
    setDocument(null);
    setError('');
    setLoading(true);
    try {
      await Promise.all([loadTasks(id), loadFeatures(id)]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not load project.',
      );
    } finally {
      setLoading(false);
    }
  }
  function replaceTask(task: Task) {
    setTasks((current) =>
      current.some((item) => item.id === task.id)
        ? current.map((item) => (item.id === task.id ? task : item))
        : [...current, task],
    );
    setDrawerId(task.id);
    setCreating(false);
  }
  function replaceProject(updated: Project) {
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
  async function dragEnd(event: DragEndEvent) {
    setActiveId(null);
    const task = tasks.find((item) => item.id === String(event.active.id));
    const over = String(event.over?.id || '');
    const destination = (
      over.startsWith('column:')
        ? over.slice(7)
        : tasks.find((item) => item.id === over)?.column
    ) as TaskColumn | undefined;
    if (!task || !destination || task.column === destination) return;
    if (!movableColumns.includes(destination)) {
      setError(
        'Done requires human review, and Canceled is reserved for feature cancellation.',
      );
      return;
    }
    try {
      const { task: moved } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/move`,
        { method: 'POST', body: JSON.stringify({ column: destination }) },
      );
      replaceTask(moved);
      setDrawerId(null);
      setNotice(`${moved.title} moved to ${labels[destination]}.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not move task.',
      );
    }
  }
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column,
          tasks
            .filter((task) => task.column === column)
            .sort((a, b) => a.position - b.position),
        ]),
      ) as Record<BoardColumn, Task[]>,
    [tasks],
  );
  const checkpoint = tasks.find((task) => task.checkpointState === 'captured');
  const visibleColumns = showCanceled
    ? columns
    : columns.filter((column) => column !== 'canceled');
  return (
    <main className="app-shell">
      <section className="app-window" aria-label="Agent Kanban">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="brand-copy">
              <strong>Agent Kanban</strong>
              <span>Local handoff desk</span>
            </span>
          </div>
          {project ? (
            <label className="project-picker">
              <FolderGit2 size={16} />
              <span>
                <strong>{project.name}</strong>
                <small>{project.repoPath}</small>
              </span>
              <select
                value={selectedId}
                onChange={(event) => chooseProject(event.target.value)}
                aria-label="Switch project"
              >
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          ) : (
            <div />
          )}
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setProjectDialogOpen(true)}
              aria-label="Import local directory"
            >
              <Settings2 size={17} />
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!project || requirementsPending}
              aria-describedby={
                requirementsPending
                  ? 'requirements-confirmation-gate'
                  : undefined
              }
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
              New task
            </button>
          </div>
        </header>
        {project && (
          <>
            <div className="context-rail">
              <div className="repo-state">
                <GitBranch size={14} />
                <strong>
                  {checkpoint?.gitBranch ?? 'Checkpoint not captured'}
                </strong>
                {checkpoint && (
                  <span
                    className={
                      checkpoint.gitDirty ? 'dirty-state' : 'clean-state'
                    }
                  >
                    {checkpoint.gitDirty ? 'Dirty' : 'Clean'}
                  </span>
                )}
              </div>
              <nav className="workspace-switch" aria-label="Project workspace">
                <button
                  type="button"
                  className={workspace === 'board' ? 'is-active' : ''}
                  onClick={() => setWorkspace('board')}
                  disabled={requirementsPending}
                  aria-describedby={
                    requirementsPending
                      ? 'requirements-confirmation-gate'
                      : undefined
                  }
                >
                  Board
                </button>
                <button
                  type="button"
                  className={workspace === 'features' ? 'is-active' : ''}
                  onClick={() => setWorkspace('features')}
                >
                  Features
                </button>
              </nav>
              <span>
                {requirementsPending ? (
                  <span
                    className="requirements-gate"
                    id="requirements-confirmation-gate"
                    role="status"
                  >
                    Confirm FEATURES.md in Features to unlock the Board and new
                    tasks.
                  </span>
                ) : workspace === 'board' ? (
                  'Drag cards through active work · review explicitly to finish'
                ) : (
                  'FEATURES.md is the requirements source of truth'
                )}
              </span>
            </div>
            {workspace === 'board' && !requirementsPending && (
              <div className="board-tools">
                <button
                  type="button"
                  className="canceled-toggle"
                  onClick={() => setShowCanceled((current) => !current)}
                >
                  {showCanceled ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showCanceled
                    ? 'Hide canceled'
                    : `Show canceled (${grouped.canceled.length})`}
                </button>
              </div>
            )}
          </>
        )}
        {error && (
          <div className="global-message error-message" role="alert">
            <CircleAlert size={16} />
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {notice && (
          <div className="global-message success-message" role="status">
            <CheckCircle2 size={16} />
            {notice}
            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" />
            <p>Loading local workspace…</p>
          </div>
        ) : !project ? (
          <div className="first-run-state">
            <h1>Connect your first local project</h1>
            <p>
              Import a new or existing local directory, then confirm its
              requirements file.
            </p>
            <button
              className="primary-button"
              onClick={() => setProjectDialogOpen(true)}
            >
              <Plus size={16} />
              Import local directory
            </button>
          </div>
        ) : workspace === 'features' || requirementsPending ? (
          <FeaturesWorkspace
            project={project}
            document={document}
            tasks={tasks}
            loading={featuresLoading}
            error={error}
            refresh={() => loadFeatures(project.id)}
            refreshTasks={() => loadTasks(project.id)}
            onDocument={setDocument}
            onProject={replaceProject}
            onNotice={setNotice}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
              const targets = args.droppableContainers.filter((container) =>
                String(container.id).startsWith('column:'),
              );
              return pointerWithin({ ...args, droppableContainers: targets })
                .length
                ? pointerWithin({ ...args, droppableContainers: targets })
                : closestCorners({ ...args, droppableContainers: targets });
            }}
            onDragStart={(event: DragStartEvent) =>
              setActiveId(String(event.active.id))
            }
            onDragCancel={() => setActiveId(null)}
            onDragEnd={dragEnd}
          >
            <div className={`board${showCanceled ? ' show-canceled' : ''}`}>
              {visibleColumns.map((column) => (
                <BoardColumnView
                  key={column}
                  column={column}
                  tasks={grouped[column]}
                  features={document?.features ?? []}
                  onOpen={(task) => setDrawerId(task.id)}
                  droppable={movableColumns.includes(column)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  features={document?.features ?? []}
                  overlay
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </section>
      <ProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={(created) => {
          setProjects((current) => [...current, created]);
          setProjectDialogOpen(false);
          setWorkspace('features');
          void chooseProject(created.id, created);
        }}
      />
      {project && (creating || drawerTask) && (
        <TaskDrawer
          key={creating ? 'new' : drawerTask?.id}
          project={project}
          task={drawerTask}
          features={document?.features ?? []}
          creating={creating}
          onClose={() => {
            setCreating(false);
            setDrawerId(null);
          }}
          onSaved={replaceTask}
          onDeleted={(id) => {
            setTasks((current) => current.filter((task) => task.id !== id));
            setDrawerId(null);
          }}
        />
      )}
    </main>
  );
}
