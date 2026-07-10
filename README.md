const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());          // allow the React app (different port) to call this API
app.use(express.json());  // parse JSON request bodies

const SECRET = 'playground-secret'; // in real apps, put this in an env variable

// Fake "database" for the demo — starts empty, fills up as people register
const users = {};

// Fake notes "database" — each note is tied to the username who owns it
// shape: { id, username, text }
let notes = [];
let nextNoteId = 1;

// ---------- AUTH ROUTES ----------

// REGISTER: create a new account with a hashed password
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  if (users[username]) {
    return res.status(409).json({ message: 'Username already taken' });
  }

  const hashedPassword = await bcrypt.hash(password, 10); // never store plain-text passwords
  users[username] = { password: hashedPassword };

  res.status(201).json({ message: 'Account created! You can now log in.' });
});

// LOGIN: check credentials, hand back a signed JWT (the "wristband")
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = users[username];
  if (!user) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign({ username }, SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Middleware: checks the wristband before letting the request through
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization']; // expect "Bearer <token>"
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = decoded; // attach decoded payload (e.g. { username })
    next();
  });
}

// ---------- CRUD ROUTES (all protected, scoped to the logged-in user) ----------

// CREATE a note
app.post('/notes', requireAuth, (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ message: 'Note text is required' });
  }

  const note = { id: nextNoteId++, username: req.user.username, text };
  notes.push(note);
  res.status(201).json(note);
});

// READ all notes belonging to the logged-in user
app.get('/notes', requireAuth, (req, res) => {
  const myNotes = notes.filter((n) => n.username === req.user.username);
  res.json(myNotes);
});

// UPDATE a note (only if it belongs to the logged-in user)
app.put('/notes/:id', requireAuth, (req, res) => {
  const { text } = req.body;
  const note = notes.find(
    (n) => n.id === Number(req.params.id) && n.username === req.user.username
  );

  if (!note) {
    return res.status(404).json({ message: 'Note not found' });
  }

  note.text = text;
  res.json(note);
});

// DELETE a note (only if it belongs to the logged-in user)
app.delete('/notes/:id', requireAuth, (req, res) => {
  const index = notes.findIndex(
    (n) => n.id === Number(req.params.id) && n.username === req.user.username
  );

  if (index === -1) {
    return res.status(404).json({ message: 'Note not found' });
  }

  notes.splice(index, 1);
  res.status(204).end();
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
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
.app {
  max-width: 420px;
  margin: 60px auto;
  font-family: system-ui, sans-serif;
}

h1 {
  text-align: center;
  font-size: 22px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-row h1 {
  margin: 0;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #fafafa;
  text-align: center;
}

.card h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  font-size: 14px;
}

input {
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  flex: 1;
}

button {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: #2563eb;
  color: white;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

button.secondary {
  background: #6b7280;
}

button.danger {
  background: #dc2626;
}

button:hover {
  opacity: 0.9;
}

.switch-link {
  margin-top: 16px;
  font-size: 13px;
  color: #2563eb;
  cursor: pointer;
  text-decoration: underline;
  text-align: center;
}

.success {
  color: #15803d;
  font-size: 14px;
}

.error {
  color: #b91c1c;
  font-size: 14px;
  margin: 8px 0;
}

.add-note-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.notes-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.note-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
}

.note-item span {
  flex: 1;
  word-break: break-word;
}

.note-actions {
  display: flex;
  gap: 6px;
}

.empty {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin-top: 20px;
}
