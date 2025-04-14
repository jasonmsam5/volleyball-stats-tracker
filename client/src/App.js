import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Box, 
  Typography, 
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Paper
} from '@mui/material';
import { 
  Add as AddIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Close as CloseIcon,
  Undo as UndoIcon
} from '@mui/icons-material';
import axios from 'axios';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [players, setPlayers] = useState([]);
  const [activePlayers, setActivePlayers] = useState([]);
  const [stats, setStats] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [openPlayerDialog, setOpenPlayerDialog] = useState(false);
  const [newPlayers, setNewPlayers] = useState([{ name: '', jersey_number: '' }]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await createNewSession(); // Create session first
        await fetchPlayers(); // Then fetch players
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };
    
    initializeApp();
  }, []);

  const fetchPlayers = async () => {
    try {
      const response = await axios.get(`${API_URL}/players`);
      setPlayers(response.data);
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  const createNewSession = async () => {
    try {
      console.log('Creating new session...'); // Debug log
      const response = await axios.post(`${API_URL}/sessions`, {
        name: `Session ${new Date().toLocaleString()}`
      });
      console.log('Session created:', response.data); // Debug log
      setSessionId(response.data.id);
      // Verify session was set
      setTimeout(() => {
        console.log('Current session ID:', sessionId);
      }, 100);
    } catch (error) {
      console.error('Error creating session:', error.response || error);
    }
  };

  const handleAddPlayer = async (player) => {
    try {
      // Validate input
      if (!player.name.trim()) {
        alert('Please enter a player name');
        return false;
      }
      if (!player.jersey_number || isNaN(player.jersey_number)) {
        alert('Please enter a valid jersey number');
        return false;
      }

      const response = await axios.post(`${API_URL}/players`, {
        name: player.name.trim(),
        jersey_number: parseInt(player.jersey_number)
      });

      if (response.data) {
        setPlayers(prevPlayers => [...prevPlayers, response.data]);
        return true;
      }
    } catch (error) {
      console.error('Error adding player:', error.response || error);
      alert(`Failed to add player ${player.name}. Please try again.`);
      return false;
    }
  };

  const handleAddMultiplePlayers = async () => {
    let successCount = 0;
    for (const player of newPlayers) {
      if (player.name.trim() && player.jersey_number) {
        const success = await handleAddPlayer(player);
        if (success) successCount++;
      }
    }
    
    if (successCount > 0) {
      alert(`Successfully added ${successCount} player(s)!`);
      setOpenPlayerDialog(false);
      setNewPlayers([{ name: '', jersey_number: '' }]);
    }
  };

  const addNewPlayerRow = () => {
    setNewPlayers([...newPlayers, { name: '', jersey_number: '' }]);
  };

  const removePlayerRow = (index) => {
    const updatedPlayers = newPlayers.filter((_, i) => i !== index);
    setNewPlayers(updatedPlayers.length ? updatedPlayers : [{ name: '', jersey_number: '' }]);
  };

  const updatePlayerField = (index, field, value) => {
    const updatedPlayers = [...newPlayers];
    updatedPlayers[index] = { ...updatedPlayers[index], [field]: value };
    setNewPlayers(updatedPlayers);
  };

  const handleDeletePlayer = async (id) => {
    try {
      await axios.delete(`${API_URL}/players/${id}`);
      setPlayers(players.filter(player => player.id !== id));
      setActivePlayers(activePlayers.filter(player => player.id !== id));
    } catch (error) {
      console.error('Error deleting player:', error);
    }
  };

  const handleAddPass = async (playerId, rating) => {
    try {
      if (!sessionId) {
        console.log('No session ID, creating new session...'); // Debug log
        await createNewSession();
      }
      console.log('Adding pass with session:', sessionId, 'player:', playerId, 'rating:', rating); // Debug log
      
      const response = await axios.post(`${API_URL}/pass_stats`, {
        session_id: sessionId,
        player_id: playerId,
        rating
      });
      
      // Update stats directly with the response data
      if (response.data.stats) {
        setStats(prevStats => ({
          ...prevStats,
          [playerId]: response.data.stats
        }));
      }
    } catch (error) {
      console.error('Error adding pass:', error.response || error);
    }
  };

  const handleUndoPass = async (playerId) => {
    try {
      if (!sessionId) {
        console.log('No session ID available for undo');
        return;
      }

      console.log('Undoing last pass for player:', playerId, 'in session:', sessionId);
      
      const response = await axios.delete(`${API_URL}/session/${sessionId}/player/${playerId}/last_pass`);
      
      if (response.data.stats) {
        // Update the stats immediately with the response data
        setStats(prevStats => ({
          ...prevStats,
          [playerId]: response.data.stats
        }));
      } else {
        // If no stats returned, fetch them
        await fetchSessionStats();
      }
    } catch (error) {
      console.error('Error undoing pass:', error.response || error);
      if (error.response?.status === 404) {
        alert('No passes to undo');
      } else {
        alert('Failed to undo pass. Please try again.');
      }
    }
  };

  const fetchSessionStats = async () => {
    try {
      if (!sessionId) {
        console.log('No session ID available for fetching stats'); // Debug log
        return;
      }
      console.log('Fetching stats for session:', sessionId); // Debug log
      
      const response = await axios.get(`${API_URL}/session/${sessionId}/stats`);
      console.log('Received stats:', response.data); // Debug log
      
      const statsMap = {};
      response.data.forEach(stat => {
        statsMap[stat.player_id] = stat;
      });
      setStats(statsMap);
    } catch (error) {
      console.error('Error fetching stats:', error.response || error);
    }
  };

  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      Object.values(stats).map(stat => ({
        Name: stat.name,
        'Jersey Number': stat.jersey_number,
        'Total Passes': stat.total_passes,
        'Average Rating': stat.average_rating?.toFixed(2) || 0
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stats');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, 'volleyball_stats.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text('Volleyball Statistics', 20, 20);
    let y = 30;
    Object.values(stats).forEach(stat => {
      doc.text(`${stat.name} (#${stat.jersey_number})`, 20, y);
      doc.text(`Total Passes: ${stat.total_passes}`, 20, y + 10);
      doc.text(`Average Rating: ${stat.average_rating?.toFixed(2) || 0}`, 20, y + 20);
      y += 40;
    });
    doc.save('volleyball_stats.pdf');
  };

  const PlayerCard = ({ player, onClose, onMoveLeft, onMoveRight }) => {
    const playerStats = stats[player.id] || { total_passes: 0, average_rating: 0 };
    const [lastClicked, setLastClicked] = useState(null);

    const handlePassClick = async (rating) => {
      setLastClicked(rating);
      await handleAddPass(player.id, rating);
      setTimeout(() => setLastClicked(null), 300); // Reset after animation
    };

    return (
      <Paper elevation={3} sx={{ p: 2, m: 1, minWidth: 250 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            {player.name} <Typography component="span" variant="h5" sx={{ color: 'black' }}>(#{player.jersey_number})</Typography>
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Box 
          display="flex" 
          justifyContent="space-around" 
          mt={3}
          gap={2}
          sx={{
            '& > button': {
              minWidth: '60px',
              height: '60px',
              fontSize: '1.5rem',
              transition: 'transform 0.2s, box-shadow 0.2s',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: 3
              },
              '&.active': {
                transform: 'scale(1.2)',
                boxShadow: 6
              }
            }
          }}
        >
          {[0, 1, 2, 3].map(rating => (
            <Button
              key={rating}
              variant="contained"
              className={lastClicked === rating ? 'active' : ''}
              sx={{
                bgcolor: rating === 0 ? 'error.main' :
                        rating === 1 ? 'warning.main' :
                        rating === 2 ? 'info.main' :
                        'success.main',
                '&:hover': {
                  bgcolor: rating === 0 ? 'error.dark' :
                          rating === 1 ? 'warning.dark' :
                          rating === 2 ? 'info.dark' :
                          'success.dark'
                }
              }}
              onClick={() => handlePassClick(rating)}
            >
              {rating}
            </Button>
          ))}
        </Box>
        <Box mt={3} textAlign="center">
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={1} mb={1}>
            <IconButton 
              onClick={onMoveLeft} 
              size="small"
              sx={{
                bgcolor: 'grey.100',
                '&:hover': {
                  bgcolor: 'grey.200'
                }
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6">Total Passes: {playerStats.total_passes}</Typography>
            <IconButton 
              onClick={onMoveRight} 
              size="small"
              sx={{
                bgcolor: 'grey.100',
                '&:hover': {
                  bgcolor: 'grey.200'
                }
              }}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Box>
          <Typography variant="h6">
            Average Rating: {playerStats.average_rating?.toFixed(2) || 0}
          </Typography>
        </Box>
      </Paper>
    );
  };

  return (
    <Container maxWidth="lg">
      <Box my={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Volleyball Stats Tracker
        </Typography>

        {/* Player Management */}
        <Box mb={4}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenPlayerDialog(true)}
          >
            Add Player
          </Button>
        </Box>

        {/* Active Player Cards */}
        <Grid container spacing={2}>
          {activePlayers.map((player, index) => (
            <Grid item xs={12} sm={6} md={4} key={player.id}>
              <PlayerCard
                player={player}
                onClose={() => setActivePlayers(activePlayers.filter(p => p.id !== player.id))}
                onMoveLeft={() => {
                  if (index > 0) {
                    const newPlayers = [...activePlayers];
                    [newPlayers[index - 1], newPlayers[index]] = [newPlayers[index], newPlayers[index - 1]];
                    setActivePlayers(newPlayers);
                  }
                }}
                onMoveRight={() => {
                  if (index < activePlayers.length - 1) {
                    const newPlayers = [...activePlayers];
                    [newPlayers[index], newPlayers[index + 1]] = [newPlayers[index + 1], newPlayers[index]];
                    setActivePlayers(newPlayers);
                  }
                }}
              />
            </Grid>
          ))}
        </Grid>

        {/* Available Players */}
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            Available Players
          </Typography>
          <Grid container spacing={2}>
            {players
              .filter(player => !activePlayers.some(p => p.id === player.id))
              .map(player => (
                <Grid item key={player.id}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      if (activePlayers.length < 6) {
                        setActivePlayers([...activePlayers, player]);
                      }
                    }}
                    endIcon={<DeleteIcon onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlayer(player.id);
                    }} />}
                  >
                    {player.name} (#{player.jersey_number})
                  </Button>
                </Grid>
              ))}
          </Grid>
        </Box>

        {/* Export Options */}
        <Box mt={4}>
          <Button variant="contained" onClick={handleExportExcel} sx={{ mr: 2 }}>
            Export to Excel
          </Button>
          <Button variant="contained" onClick={handleExportPDF}>
            Export to PDF
          </Button>
        </Box>

        {/* Add Player Dialog */}
        <Dialog open={openPlayerDialog} onClose={() => setOpenPlayerDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Players</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2 }}>
              {newPlayers.map((player, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                  <TextField
                    autoFocus={index === 0}
                    label="Name"
                    value={player.name}
                    onChange={(e) => updatePlayerField(index, 'name', e.target.value)}
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    label="Jersey Number"
                    type="number"
                    value={player.jersey_number}
                    onChange={(e) => updatePlayerField(index, 'jersey_number', e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <IconButton 
                    onClick={() => removePlayerRow(index)}
                    sx={{ color: 'error.main' }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
              <Button 
                onClick={addNewPlayerRow}
                startIcon={<AddIcon />}
                sx={{ mt: 1 }}
              >
                Add Another Player
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenPlayerDialog(false)}>Cancel</Button>
            <Button onClick={handleAddMultiplePlayers} variant="contained">
              Save All Players
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
}

export default App; 