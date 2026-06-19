import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Avatar from './Avatar.jsx';

const emptyForm = {
  title: '',
  dueDate: '',
  requestedBy: '',
  details: '',
};

export default function Todos({ avatars }) {
  const [todos, setTodos] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    try {
      const { todos } = await api.listTodos();
      setTodos(todos);
    } catch (e) { setError(e.message); }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({
      title: t.title,
      dueDate: t.due_date || '',
      requestedBy: t.requested_by || '',
      details: t.details || '',
    });
    setError('');
    document.querySelector('.todo-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        dueDate: form.dueDate || null,
        requestedBy: form.requestedBy || null,
        details: form.details || null,
      };
      if (editingId) await api.updateTodo(editingId, payload);
      else await api.createTodo(payload);
      cancelEdit();
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function toggleDone(t) {
    try {
      await api.updateTodo(t.id, { done: !t.done });
      await refresh();
    } catch (e) { alert(e.message); }
  }

  async function remove(t) {
    if (!confirm(`Supprimer "${t.title}" ?`)) return;
    try {
      await api.deleteTodo(t.id);
      if (editingId === t.id) cancelEdit();
      await refresh();
    } catch (e) { alert(e.message); }
  }

  const { pending, done } = useMemo(() => {
    const p = [], d = [];
    for (const t of todos) (t.done ? d : p).push(t);
    return { pending: p, done: d };
  }, [todos]);

  return (
    <section className="todos-section">
      <div className="todo-form-card">
        <h2>{editingId ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>
        <form onSubmit={submit} className="todo-form-grid">
          <label className="full">
            <span>Titre *</span>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Que faut-il faire ?"
              autoFocus
            />
          </label>
          <label>
            <span>Date d'échéance</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm({ ...form, dueDate: e.target.value })}
            />
          </label>
          <label>
            <span>Demandé par</span>
            <input
              value={form.requestedBy}
              onChange={e => setForm({ ...form, requestedBy: e.target.value })}
              placeholder="ex: Patron, Marie, Client X…"
            />
          </label>
          <label className="full">
            <span>Détails</span>
            <textarea
              rows="2"
              value={form.details}
              onChange={e => setForm({ ...form, details: e.target.value })}
              placeholder="Contexte, précisions…"
            />
          </label>

          {error && <div className="error full">{error}</div>}

          <div className="todo-form-actions full">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '…' : editingId ? 'Enregistrer' : 'Ajouter la tâche'}
            </button>
            {editingId && (
              <button type="button" className="ghost" onClick={cancelEdit}>Annuler</button>
            )}
          </div>
        </form>
      </div>

      <div className="todos-lists">
        <div className="todo-list-section">
          <h3 className="todo-list-title">
            À faire <span className="todo-count">{pending.length}</span>
          </h3>
          {pending.length === 0 ? (
            <p className="empty">Rien à faire — bien joué.</p>
          ) : (
            <ul className="todo-list">
              {pending.map(t => (
                <TodoCard
                  key={t.id}
                  todo={t}
                  avatars={avatars}
                  onToggle={() => toggleDone(t)}
                  onEdit={() => startEdit(t)}
                  onDelete={() => remove(t)}
                  isEditing={editingId === t.id}
                />
              ))}
            </ul>
          )}
        </div>

        {done.length > 0 && (
          <div className="todo-list-section">
            <h3 className="todo-list-title todo-list-title-done">
              Fait <span className="todo-count">{done.length}</span>
            </h3>
            <ul className="todo-list">
              {done.map(t => (
                <TodoCard
                  key={t.id}
                  todo={t}
                  avatars={avatars}
                  onToggle={() => toggleDone(t)}
                  onEdit={() => startEdit(t)}
                  onDelete={() => remove(t)}
                  isEditing={editingId === t.id}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function TodoCard({ todo, avatars, onToggle, onEdit, onDelete, isEditing }) {
  const dueStatus = getDueStatus(todo.due_date, todo.done);
  return (
    <li className={`todo-card ${todo.done ? 'is-done' : ''} ${isEditing ? 'is-editing' : ''}`}>
      <label className="todo-check">
        <input type="checkbox" checked={todo.done} onChange={onToggle} />
      </label>
      <div className="todo-main">
        <div className="todo-title">{todo.title}</div>
        {todo.details && <div className="todo-details">{todo.details}</div>}
        <div className="todo-meta">
          {todo.due_date && (
            <span className={`todo-due todo-due-${dueStatus}`}>
              📅 {formatDateShort(todo.due_date)}
              {dueStatus === 'overdue' && ' · en retard'}
              {dueStatus === 'today' && ' · aujourd\'hui'}
            </span>
          )}
          {todo.requested_by && (
            <span className="todo-requested">Demandé par <b>{todo.requested_by}</b></span>
          )}
          <span className="todo-created">
            <Avatar name={todo.created_by} avatar={avatars[todo.created_by]} size={16} />
            <span>{todo.created_by}</span>
          </span>
        </div>
      </div>
      <div className="todo-actions">
        <button className="ghost" onClick={onEdit}>Modifier</button>
        <button className="ghost danger-ghost" onClick={onDelete}>Suppr.</button>
      </div>
    </li>
  );
}

function getDueStatus(dueDate, done) {
  if (!dueDate || done) return 'neutral';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  if (isNaN(due)) return 'neutral';
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return 'future';
}

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
