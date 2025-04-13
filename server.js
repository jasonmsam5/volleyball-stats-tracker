const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://volleyball-stats-tracker.vercel.app'], // Allow both local and deployed frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'client/build')));

// Database setup
const db = new sqlite3.Database('volleyball.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Players table
    db.run(`CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      jersey_number INTEGER NOT NULL
    )`);

    // Sessions table
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Pass stats table
    db.run(`CREATE TABLE IF NOT EXISTS pass_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      player_id INTEGER,
      rating INTEGER CHECK (rating BETWEEN 0 AND 3),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`);
  });
}

// API Routes
// Players
app.get('/api/players', (req, res) => {
  console.log('GET /api/players - Fetching all players');
  db.all('SELECT * FROM players', [], (err, rows) => {
    if (err) {
      console.error('Error fetching players:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log('Successfully fetched players:', rows);
    res.json(rows);
  });
});

app.post('/api/players', (req, res) => {
  const { name, jersey_number } = req.body;
  console.log('POST /api/players - Adding new player:', { name, jersey_number });

  if (!name || !jersey_number) {
    console.error('Invalid player data:', req.body);
    res.status(400).json({ error: 'Name and jersey number are required' });
    return;
  }

  db.run('INSERT INTO players (name, jersey_number) VALUES (?, ?)',
    [name, jersey_number],
    function(err) {
      if (err) {
        console.error('Error adding player:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      const newPlayer = { id: this.lastID, name, jersey_number };
      console.log('Successfully added player:', newPlayer);
      res.json(newPlayer);
    });
});

app.put('/api/players/:id', (req, res) => {
  const { name, jersey_number } = req.body;
  db.run('UPDATE players SET name = ?, jersey_number = ? WHERE id = ?',
    [name, jersey_number, req.params.id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: req.params.id, name, jersey_number });
    });
});

app.delete('/api/players/:id', (req, res) => {
  db.run('DELETE FROM players WHERE id = ?', [req.params.id], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Player deleted successfully' });
  });
});

// Sessions
app.post('/api/sessions', (req, res) => {
  const { name } = req.body;
  console.log('Creating new session with name:', name);

  if (!name) {
    console.error('Session name is required');
    res.status(400).json({ error: 'Session name is required' });
    return;
  }

  db.run('INSERT INTO sessions (name) VALUES (?)',
    [name],
    function(err) {
      if (err) {
        console.error('Error creating session:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      const newSession = { id: this.lastID, name };
      console.log('Successfully created session:', newSession);
      res.json(newSession);
    });
});

// Pass Stats
app.post('/api/pass_stats', (req, res) => {
  const { session_id, player_id, rating } = req.body;
  console.log('Adding pass stat:', { session_id, player_id, rating });

  if (!session_id || !player_id || rating === undefined) {
    console.error('Invalid pass stat data:', req.body);
    res.status(400).json({ error: 'Session ID, player ID, and rating are required' });
    return;
  }

  db.run('INSERT INTO pass_stats (session_id, player_id, rating) VALUES (?, ?, ?)',
    [session_id, player_id, rating],
    function(err) {
      if (err) {
        console.error('Error adding pass stat:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      const newStat = { id: this.lastID, session_id, player_id, rating };
      console.log('Successfully added pass stat:', newStat);
      res.json(newStat);
    });
});

app.get('/api/session/:id/stats', (req, res) => {
  const sessionId = req.params.id;
  console.log('Fetching stats for session:', sessionId);

  if (!sessionId || sessionId === 'null') {
    console.error('Invalid session ID:', sessionId);
    res.status(400).json({ error: 'Valid session ID is required' });
    return;
  }

  const query = `
    SELECT 
      p.id as player_id,
      p.name,
      p.jersey_number,
      COUNT(ps.id) as total_passes,
      AVG(ps.rating) as average_rating
    FROM players p
    LEFT JOIN pass_stats ps ON p.id = ps.player_id AND ps.session_id = ?
    GROUP BY p.id
  `;
  
  db.all(query, [sessionId], (err, rows) => {
    if (err) {
      console.error('Error fetching session stats:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    console.log('Successfully fetched session stats:', rows);
    res.json(rows);
  });
});

// Undo last pass
app.delete('/api/session/:sessionId/player/:playerId/last_pass', (req, res) => {
  const { sessionId, playerId } = req.params;
  console.log('Undoing last pass for session:', sessionId, 'player:', playerId);

  if (!sessionId || !playerId) {
    console.error('Invalid session or player ID');
    res.status(400).json({ error: 'Valid session ID and player ID are required' });
    return;
  }

  // First, get the last pass ID for this player in this session
  db.get(
    'SELECT id FROM pass_stats WHERE session_id = ? AND player_id = ? ORDER BY timestamp DESC LIMIT 1',
    [sessionId, playerId],
    (err, row) => {
      if (err) {
        console.error('Error finding last pass:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      if (!row) {
        console.log('No passes found to undo');
        res.status(404).json({ error: 'No passes found to undo' });
        return;
      }

      // Delete the last pass
      db.run(
        'DELETE FROM pass_stats WHERE id = ?',
        [row.id],
        function(err) {
          if (err) {
            console.error('Error deleting pass:', err);
            res.status(500).json({ error: err.message });
            return;
          }

          // Get updated stats for this player
          db.get(`
            SELECT 
              p.id as player_id,
              p.name,
              p.jersey_number,
              COUNT(ps.id) as total_passes,
              AVG(ps.rating) as average_rating
            FROM players p
            LEFT JOIN pass_stats ps ON p.id = ps.player_id AND ps.session_id = ?
            WHERE p.id = ?
            GROUP BY p.id
          `, [sessionId, playerId], (err, updatedStats) => {
            if (err) {
              console.error('Error fetching updated stats:', err);
              res.status(500).json({ error: err.message });
              return;
            }

            console.log('Successfully deleted last pass and fetched updated stats:', updatedStats);
            res.json({
              message: 'Last pass deleted successfully',
              stats: updatedStats || {
                player_id: playerId,
                total_passes: 0,
                average_rating: 0
              }
            });
          });
        }
      );
    }
  );
});

// Serve React app in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 