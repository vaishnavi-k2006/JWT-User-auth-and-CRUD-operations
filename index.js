require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());          // allow the React app (different port) to call this API
app.use(express.json());  // parse JSON request bodies

const SECRET = process.env.JWT_SECRET || 'playground-secret';
const MONGO_URI = process.env.MONGO_URI; // put your MongoDB Atlas connection string in .env

// ---------- CONNECT TO MONGODB ----------

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ---------- SCHEMAS / MODELS ----------

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true } // stored hashed, never plain text
});
const User = mongoose.model('User', userSchema);

const noteSchema = new mongoose.Schema({
  username: { type: String, required: true }, // owner of the note
  text: { type: String, required: true }
}, { timestamps: true });
const Note = mongoose.model('Note', noteSchema);

// ---------- AUTH ROUTES ----------

// REGISTER: create a new account with a hashed password
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword });

    res.status(201).json({ message: 'Account created! You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// LOGIN: check credentials, hand back a signed JWT (the "wristband")
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ username }, SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Server error during login' });
  }
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
app.post('/notes', requireAuth, async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ message: 'Note text is required' });
  }

  try {
    const note = await Note.create({ username: req.user.username, text });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error creating note' });
  }
});

// READ all notes belonging to the logged-in user
app.get('/notes', requireAuth, async (req, res) => {
  try {
    const myNotes = await Note.find({ username: req.user.username }).sort({ createdAt: -1 });
    res.json(myNotes);
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching notes' });
  }
});

// UPDATE a note (only if it belongs to the logged-in user)
app.put('/notes/:id', requireAuth, async (req, res) => {
  const { text } = req.body;

  try {
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, username: req.user.username },
      { text },
      { new: true } // return the updated document
    );

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json(note);
  } catch (err) {
    res.status(500).json({ message: 'Server error updating note' });
  }
});

// DELETE a note (only if it belongs to the logged-in user)
app.delete('/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      username: req.user.username
    });

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ message: 'Server error deleting note' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));