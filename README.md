# Volleyball Stats Tracker

A full-stack application for tracking volleyball statistics in real-time. Built with React, Node.js, Express, and SQLite.

## Features

- Player Management (add, edit, delete)
- Real-time stat tracking
- Up to 6 player cards visible at once
- Color-coded pass rating buttons (0-3)
- Undo functionality
- Card reordering
- Live individual and team statistics
- Export to Excel and PDF
- Mobile-friendly design

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository
2. Install backend dependencies:
   ```bash
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd client
   npm install
   ```

## Running the Application

1. Start the backend server:
   ```bash
   npm start
   ```
2. In a new terminal, start the frontend development server:
   ```bash
   cd client
   npm start
   ```

The application will be available at `http://localhost:3000`

## Usage

1. Add players using the "Add Player" button
2. Click on available players to add them to the active cards (up to 6)
3. Use the color-coded buttons to record pass ratings
4. Use the undo button to remove the last rating
5. Reorder cards using the left/right arrows
6. Export statistics using the Excel or PDF buttons

## Technology Stack

- Frontend: React, Material-UI
- Backend: Node.js, Express
- Database: SQLite
- Export: SheetJS (Excel), jsPDF (PDF)

## License

MIT 