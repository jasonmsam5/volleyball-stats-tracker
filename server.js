const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/volleyball',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        jersey_number INTEGER NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pass_stats (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id),
        player_id INTEGER REFERENCES players(id),
        rating INTEGER CHECK (rating BETWEEN 0 AND 3),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Initialize database on startup
initializeDatabase();

// API Routes
// Players
app.get('/api/players', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM players');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/players', async (req, res) => {
  const { name, jersey_number } = req.body;
  
  if (!name || !jersey_number) {
    res.status(400).json({ error: 'Name and jersey number are required' });
    return;
  }

  try {
    const result = await pool.query(
      'INSERT INTO players (name, jersey_number) VALUES ($1, $2) RETURNING *',
      [name, jersey_number]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding player:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/players/:id', async (req, res) => {
  const { name, jersey_number } = req.body;
  try {
    const result = await pool.query(
      'UPDATE players SET name = $1, jersey_number = $2 WHERE id = $3 RETURNING *',
      [name, jersey_number, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/players/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
    res.json({ message: 'Player deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sessions
app.post('/api/sessions', async (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    res.status(400).json({ error: 'Session name is required' });
    return;
  }

  try {
    const result = await pool.query(
      'INSERT INTO sessions (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Pass Stats
app.post('/api/pass_stats', async (req, res) => {
  const { session_id, player_id, rating } = req.body;
  
  if (!session_id || !player_id || rating === undefined) {
    res.status(400).json({ error: 'Session ID, player ID, and rating are required' });
    return;
  }

  try {
    const result = await pool.query(
      'INSERT INTO pass_stats (session_id, player_id, rating) VALUES ($1, $2, $3) RETURNING *',
      [session_id, player_id, rating]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding pass stat:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session/:id/stats', async (req, res) => {
  const sessionId = req.params.id;
  
  if (!sessionId || sessionId === 'null') {
    res.status(400).json({ error: 'Valid session ID is required' });
    return;
  }

  try {
    const result = await pool.query(`
      SELECT 
        p.id as player_id,
        p.name,
        p.jersey_number,
        COUNT(ps.id) as total_passes,
        AVG(ps.rating) as average_rating
      FROM players p
      LEFT JOIN pass_stats ps ON p.id = ps.player_id AND ps.session_id = $1
      GROUP BY p.id
    `, [sessionId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching session stats:', err);
    res.status(500).json({ error: err.message });
  }
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
  pool.query(
    'SELECT id FROM pass_stats WHERE session_id = $1 AND player_id = $2 ORDER BY timestamp DESC LIMIT 1',
    [sessionId, playerId],
    (err, result) => {
      if (err) {
        console.error('Error finding last pass:', err);
        res.status(500).json({ error: err.message });
        return;
      }

      if (result.rows.length === 0) {
        console.log('No passes found to undo');
        res.status(404).json({ error: 'No passes found to undo' });
        return;
      }

      const lastPassId = result.rows[0].id;

      // Delete the last pass
      pool.query(
        'DELETE FROM pass_stats WHERE id = $1',
        [lastPassId],
        (err) => {
          if (err) {
            console.error('Error deleting pass:', err);
            res.status(500).json({ error: err.message });
            return;
          }

          // Get updated stats for this player
          pool.query(
            `
            SELECT 
              p.id as player_id,
              p.name,
              p.jersey_number,
              COUNT(ps.id) as total_passes,
              AVG(ps.rating) as average_rating
            FROM players p
            LEFT JOIN pass_stats ps ON p.id = ps.player_id AND ps.session_id = $1
            WHERE p.id = $2
            GROUP BY p.id
            `,
            [sessionId, playerId],
            (err, result) => {
              if (err) {
                console.error('Error fetching updated stats:', err);
                res.status(500).json({ error: err.message });
                return;
              }

              console.log('Successfully deleted last pass and fetched updated stats:', result.rows);
              res.json({
                message: 'Last pass deleted successfully',
                stats: result.rows[0] || {
                  player_id: playerId,
                  total_passes: 0,
                  average_rating: 0
                }
              });
            }
          );
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