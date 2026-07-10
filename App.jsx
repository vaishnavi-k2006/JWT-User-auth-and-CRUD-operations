import { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000';

function App() {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);

  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const resetMessages = () => {
    setError('');
    setInfo('');
  };

  // Small helper so every fetch to a protected route includes the token
  const authFetch = (path, options = {}) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

  // Load notes whenever we have a token (i.e. right after login)
  useEffect(() => {
    if (token) fetchNotes();
  }, [token]);

  // ---------- AUTH ----------

  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();

    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message);
        return;
      }

      setInfo(data.message);
      setMode('login');
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message);
        return;
      }

      setToken(data.token);
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setNotes([]);
    resetMessages();
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    resetMessages();
  };

  // ---------- CRUD ----------

  const fetchNotes = async () => {
    resetMessages();
    try {
      const res = await authFetch('/notes');
      const data = await res.json();
      if (!res.ok) {
        setError(data.message);
        return;
      }
      setNotes(data);
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    try {
      const res = await authFetch('/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newNoteText })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message);
        return;
      }
      setNotes([...notes, data]);
      setNewNoteText('');
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  const startEditing = (note) => {
    setEditingId(note.id);
    setEditingText(note.text);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText('');
  };

  const handleUpdateNote = async (id) => {
    try {
      const res = await authFetch(`/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editingText })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message);
        return;
      }
      setNotes(notes.map((n) => (n.id === id ? data : n)));
      cancelEditing();
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      const res = await authFetch(`/notes/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        setError(data.message);
        return;
      }
      setNotes(notes.filter((n) => n.id !== id));
    } catch (err) {
      setError('Could not reach the server.');
    }
  };

  // ---------- VIEWS ----------

  // Logged in: show CRUD notes UI
  if (token) {
    return (
      <div className="app">
        <div className="header-row">
          <h1>My Notes</h1>
          <button onClick={handleLogout} className="secondary">Log Out</button>
        </div>

        <form onSubmit={handleAddNote} className="add-note-form">
          <input
            placeholder="Write a note..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>

        {error && <p className="error">{error}</p>}

        <ul className="notes-list">
          {notes.map((note) => (
            <li key={note.id} className="note-item">
              {editingId === note.id ? (
                <>
                  <input
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                  />
                  <div className="note-actions">
                    <button onClick={() => handleUpdateNote(note.id)}>Save</button>
                    <button onClick={cancelEditing} className="secondary">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <span>{note.text}</span>
                  <div className="note-actions">
                    <button onClick={() => startEditing(note)}>Edit</button>
                    <button onClick={() => handleDeleteNote(note.id)} className="danger">
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {notes.length === 0 && <p className="empty">No notes yet — add one above.</p>}
      </div>
    );
  }

  // Logged out: show login or register form
  return (
    <div className="app">
      <h1>JWT + CRUD Demo</h1>

      <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="card">
        <h2>{mode === 'login' ? 'Log In' : 'Register'}</h2>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <button type="submit">{mode === 'login' ? 'Log In' : 'Create Account'}</button>

        {info && <p className="success">{info}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <p className="switch-link" onClick={switchMode}>
        {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
      </p>
    </div>
  );
}

export default App;