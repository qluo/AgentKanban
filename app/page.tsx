'use client';

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Upload,
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
} from '@/src/lib/types';

type Workspace = 'board' | 'features';
type BoardColumn = TaskColumn;
type FeaturesDocument = {
  exists: boolean;
  path: string;
  markdown: string | null;
  features: Feature[];
};
type MigrationPreview = {
  project: {
    name: string;
    repoRemote: string | null;
    defaultBranch: string | null;
  };
  featureCount: number;
  taskCount: number;
  destinationPath: string;
  existingFeatures: boolean;
  importedFeatures: boolean;
  featuresConflict: boolean;
  canUseExistingFeatures: boolean;
  destinationFeaturesVersion: string;
  existingFeaturesContent: string | null;
  importedFeaturesContent: string | null;
};

const columns: BoardColumn[] = [
  'backlog',
  'ready',
  'in-progress',
  'verification',
  'done',
  'canceled',
];
const TASK_POLL_INTERVAL_MS = 5_000;
const labels: Record<BoardColumn, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  'in-progress': 'In Progress',
  verification: 'Validation',
  done: 'Done',
  canceled: 'Canceled',
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
}: {
  task: Task;
  features: Feature[];
  onOpen?: (task: Task) => void;
}) {
  const feature = features.find((item) => item.id === task.featureId);
  const progress =
    task.progress.trim() ||
    (task.createdBy === 'human'
      ? 'No next action recorded yet.'
      : 'No next action recorded.');

  return (
    <button
      type="button"
      className={`task-card${task.column === 'canceled' ? ' is-canceled' : ''}`}
      onClick={() => onOpen?.(task)}
    >
      <div className="task-card-topline">
        <span className="task-reference">{task.reference}</span>
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
    </button>
  );
}

function BoardColumnView({
  column,
  tasks,
  features,
  onOpen,
}: {
  column: BoardColumn;
  tasks: Task[];
  features: Feature[];
  onOpen: (task: Task) => void;
}) {
  const emptyCopy =
    column === 'verification'
      ? 'Ready for validation'
      : column === 'done'
        ? 'No validated tasks'
        : 'No tasks here';
  return (
    <section
      className={`board-column column-${column}`}
      aria-labelledby={`heading-${column}`}
    >
      <header className="column-header">
        <div className="column-title">
          <span className="route-node" />
          <h2 id={`heading-${column}`}>{labels[column]}</h2>
        </div>
        <span className="column-count">{tasks.length}</span>
      </header>
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

function MigrationDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (project: Project) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [jsonl, setJsonl] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [featuresChoice, setFeaturesChoice] = useState<
    'existing' | 'imported' | null
  >(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setFileName('');
    setJsonl('');
    setRepoPath('');
    setPreview(null);
    setFeaturesChoice(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }
  function close() {
    reset();
    onClose();
  }
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  async function selectFile(file: File | undefined) {
    setPreview(null);
    setFeaturesChoice(null);
    setError('');
    if (!file) {
      setFileName('');
      setJsonl('');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileName('');
      setJsonl('');
      setError('Migration files must be 10 MB or smaller.');
      return;
    }
    try {
      const content = await file.text();
      setFileName(file.name);
      setJsonl(content);
      setRepoPath((current) => {
        if (current.trim()) return current;
        try {
          const projectRecord = content
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Record<string, unknown>)
            .find((record) => record.type === 'project');
          const projectName =
            typeof projectRecord?.name === 'string'
              ? projectRecord.name.trim().replace(/[\\/]+/g, '-')
              : '';
          return projectName ? `~/projects/${projectName}` : current;
        } catch {
          return current;
        }
      });
    } catch {
      setError('Could not read the selected migration file.');
    }
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const { preview: nextPreview } = await api<{
        preview: MigrationPreview;
      }>('/api/projects/import/preview', {
        method: 'POST',
        body: JSON.stringify({ jsonl, repoPath }),
      });
      setPreview(nextPreview);
      setRepoPath(nextPreview.destinationPath);
      setFeaturesChoice(
        nextPreview.featuresConflict
          ? null
          : nextPreview.importedFeatures
            ? 'imported'
            : nextPreview.existingFeatures
              ? 'existing'
              : null,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not review this migration.',
      );
    } finally {
      setWorking(false);
    }
  }
  async function importProject() {
    if (!preview) return;
    setWorking(true);
    setError('');
    try {
      const { project } = await api<{ project: Project }>(
        '/api/projects/import',
        {
          method: 'POST',
          body: JSON.stringify({
            jsonl,
            repoPath,
            featuresChoice,
            destinationFeaturesVersion:
              preview.destinationFeaturesVersion,
          }),
        },
      );
      reset();
      onImported(project);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Could not import project.';
      if (message.includes('changed after review')) {
        setPreview(null);
        setFeaturesChoice(null);
      }
      setError(message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog migration-dialog"
      onClose={close}
      aria-labelledby="migration-dialog-title"
    >
      <form onSubmit={review}>
        <div className="dialog-heading">
          <div>
            <h2 id="migration-dialog-title">Import project migration</h2>
            <p>
              Restore features, task contracts, progress, validation, Git
              checkpoints, and pull-request links into a local directory.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="Close migration import"
          >
            <X size={17} />
          </button>
        </div>
        <div className="migration-file-row">
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept=".jsonl,application/x-ndjson,application/json"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={15} />
            Choose JSONL
          </button>
          <span>{fileName || 'No migration file selected'}</span>
        </div>
        <label>
          Destination local directory
          <span className="field-note">
            The directory is created if needed. Exported absolute paths are
            never reused.
          </span>
          <input
            value={repoPath}
            onChange={(event) => {
              setRepoPath(event.target.value);
              setPreview(null);
              setFeaturesChoice(null);
            }}
            required
            placeholder="~/projects/project-name"
          />
        </label>
        {preview && (
          <section className="migration-preview" aria-live="polite">
            <div className="migration-summary">
              <div>
                <span>Project</span>
                <strong>{preview.project.name}</strong>
              </div>
              <div>
                <span>Features</span>
                <strong>{preview.featureCount}</strong>
              </div>
              <div>
                <span>Tasks</span>
                <strong>{preview.taskCount}</strong>
              </div>
            </div>
            {(preview.project.repoRemote || preview.project.defaultBranch) && (
              <p className="migration-repository">
                {preview.project.repoRemote || 'No repository remote'}
                {preview.project.defaultBranch
                  ? ` · ${preview.project.defaultBranch}`
                  : ''}
              </p>
            )}
            {preview.featuresConflict ? (
              <fieldset className="features-conflict">
                <legend>Choose which FEATURES.md to keep</legend>
                <p>
                  The destination file differs from the migration. Agent
                  Kanban will not overwrite it without your choice.
                </p>
                <div className="features-comparison">
                  <section>
                    <strong>Destination file</strong>
                    <pre>
                      {preview.existingFeaturesContent ||
                        'The destination file is empty.'}
                    </pre>
                  </section>
                  <section>
                    <strong>Migration file</strong>
                    <pre>
                      {preview.importedFeaturesContent ||
                        'The migration file is empty.'}
                    </pre>
                  </section>
                </div>
                <label>
                  <input
                    type="radio"
                    name="features-choice"
                    value="imported"
                    checked={featuresChoice === 'imported'}
                    onChange={() => setFeaturesChoice('imported')}
                  />
                  Restore the FEATURES.md from this migration
                </label>
                <label
                  className={
                    !preview.canUseExistingFeatures ? 'is-disabled' : ''
                  }
                >
                  <input
                    type="radio"
                    name="features-choice"
                    value="existing"
                    checked={featuresChoice === 'existing'}
                    disabled={!preview.canUseExistingFeatures}
                    onChange={() => setFeaturesChoice('existing')}
                  />
                  Keep the destination FEATURES.md
                </label>
                {!preview.canUseExistingFeatures && (
                  <small>
                    The destination file is missing feature IDs used by
                    imported tasks.
                  </small>
                )}
              </fieldset>
            ) : (
              <p className="features-ready">
                <CheckCircle2 size={15} />
                {preview.existingFeatures
                  ? 'The destination FEATURES.md is compatible.'
                  : preview.importedFeatures
                    ? 'FEATURES.md will be restored from the migration.'
                    : 'This migration does not contain FEATURES.md.'}
              </p>
            )}
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            <CircleAlert size={15} />
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          {preview ? (
            <button
              type="button"
              className="primary-button"
              onClick={importProject}
              disabled={
                working || (preview.featuresConflict && !featuresChoice)
              }
            >
              {working && <LoaderCircle className="spin" size={15} />}
              Import project
            </button>
          ) : (
            <button
              type="submit"
              className="primary-button"
              disabled={working || !jsonl || !repoPath.trim()}
            >
              {working && <LoaderCircle className="spin" size={15} />}
              Review migration
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

function TaskDrawer({
  task,
  features,
  onClose,
  onReverted,
}: {
  task: Task;
  features: Feature[];
  onClose: () => void;
  onReverted: (task: Task) => void;
}) {
  const [error, setError] = useState('');
  const [reverting, setReverting] = useState(false);
  const previousColumn: Partial<Record<TaskColumn, TaskColumn>> = {
    ready: 'backlog',
    'in-progress': 'ready',
    verification: 'in-progress',
    done: 'verification',
  };
  const previous = previousColumn[task.column];
  async function revertStatus() {
    if (!previous) return;
    setReverting(true);
    setError('');
    try {
      const { task: reverted } = await api<{ task: Task }>(
        `/api/tasks/${task.id}/move`,
        { method: 'POST', body: JSON.stringify({ column: previous }) },
      );
      onReverted(reverted);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not revert the task status.',
      );
    } finally {
      setReverting(false);
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close task details"
        className="drawer-scrim is-open"
        onClick={onClose}
      />
      <aside
        className="task-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
      >
        <div className="task-drawer-content">
          <header className="drawer-header">
            <div>
              <p>{`${task.reference} · ${labels[task.column]}`}</p>
              <h2 id="task-drawer-title">{task.title}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close task details"
            >
              <X size={18} />
            </button>
          </header>
          <div className="drawer-body">
            <p className="agent-managed-notice">
              Read-only in the web app. Agents maintain task content and status;
              humans may only revert a status from the footer.
            </p>
            <label>
              Title
              <input value={task.title} readOnly />
            </label>
            <label>
              Task and acceptance criteria
              <textarea value={task.task} readOnly rows={4} />
            </label>
            {task.featureId ? (
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
              <textarea value={task.progress} readOnly rows={4} />
            </label>
            <label>
              Decisions
              <textarea value={task.decisions} readOnly rows={3} />
            </label>
            <div className="verification-fields">
              <label>
                Validation result
                <select value={task.verificationStatus} disabled>
                  <option value="not_run">Not run</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="partial">Partial</option>
                </select>
              </label>
              <label>
                Validation notes
                <textarea value={task.verificationNotes} readOnly rows={3} />
              </label>
            </div>
            <section className="checkpoint-panel">
              <div>
                <h3>Git checkpoint</h3>
                <p>{checkpointText(task)}</p>
              </div>
            </section>
            <div className="read-only-field pull-request-field">
              <span>Pull request</span>
              {task.pullRequestUrl ? (
                <a href={task.pullRequestUrl} target="_blank" rel="noreferrer">
                  <span>{task.pullRequestUrl}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : (
                <strong>Not linked yet</strong>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                <CircleAlert size={15} />
                {error}
              </p>
            )}
          </div>
          {previous && (
            <footer className="drawer-footer read-only-footer">
              <span>Need to send this task back?</span>
              <button
                type="button"
                className="secondary-button"
                onClick={revertStatus}
                disabled={reverting}
              >
                {reverting && <LoaderCircle className="spin" size={15} />}
                Revert to {labels[previous]}
              </button>
            </footer>
          )}
        </div>
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
  onOpenTask,
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
  onOpenTask: (task: Task) => void;
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
                      <button
                        type="button"
                        className="linked-task-button"
                        onClick={() => onOpenTask(task)}
                      >
                        <div>
                          <strong>
                            {task.reference} · {task.title}
                          </strong>
                          <span>
                            {task.progress || 'No next action recorded yet.'}
                          </span>
                        </div>
                        <em>{labels[task.column]}</em>
                      </button>
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
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const project = projects.find((item) => item.id === selectedId) ?? null;
  const requirementsPending = project?.featuresConfirmedAt === null;
  const drawerTask = tasks.find((task) => task.id === drawerId) ?? null;
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
    let interval: number | undefined;
    const poll = () => {
      loadTasks(selectedId).catch(() => undefined);
    };
    const startPolling = () => {
      if (interval === undefined) {
        interval = window.setInterval(poll, TASK_POLL_INTERVAL_MS);
      }
    };
    const stopPolling = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };
    const handleVisibility = () => {
      if (window.document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        poll();
        startPolling();
      }
    };
    handleVisibility();
    window.document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopPolling();
      window.document.removeEventListener('visibilitychange', handleVisibility);
    };
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
  }
  function replaceProject(updated: Project) {
    setProjects((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
  async function exportProject() {
    if (!project) return;
    setExporting(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${project.id}/export`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || 'Could not export project.');
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        'agent-kanban-project.jsonl';
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`${project.name} exported as ${filename}.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not export project.',
      );
    } finally {
      setExporting(false);
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
          <button
            className="secondary-button topbar-new-project"
            type="button"
            onClick={() => setProjectDialogOpen(true)}
          >
            <Plus size={16} />
            New project
          </button>
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
            <div className="project-picker-placeholder" />
          )}
          <div className="topbar-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setMigrationDialogOpen(true)}
            >
              <Upload size={15} />
              Import
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void exportProject()}
              disabled={!project || exporting}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Download size={15} />
              )}
              Export
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
                    Confirm FEATURES.md in Features to unlock the Board.
                  </span>
                ) : workspace === 'board' ? (
                  'Tasks are managed by agents · open a card to inspect'
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
            onOpenTask={(task) => setDrawerId(task.id)}
            onNotice={setNotice}
          />
        ) : (
          <div className={`board${showCanceled ? ' show-canceled' : ''}`}>
            {visibleColumns.map((column) => (
              <BoardColumnView
                key={column}
                column={column}
                tasks={grouped[column]}
                features={document?.features ?? []}
                onOpen={(task) => setDrawerId(task.id)}
              />
            ))}
          </div>
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
      <MigrationDialog
        open={migrationDialogOpen}
        onClose={() => setMigrationDialogOpen(false)}
        onImported={(imported) => {
          setProjects((current) => [...current, imported]);
          setMigrationDialogOpen(false);
          setWorkspace(imported.featuresConfirmedAt ? 'board' : 'features');
          setNotice(`${imported.name} imported successfully.`);
          void chooseProject(imported.id, imported);
        }}
      />
      {project && drawerTask && (
        <TaskDrawer
          key={drawerTask.id}
          task={drawerTask}
          features={document?.features ?? []}
          onClose={() => setDrawerId(null)}
          onReverted={replaceTask}
        />
      )}
    </main>
  );
}
