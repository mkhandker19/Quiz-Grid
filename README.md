# Quiz-Grid

A full-featured quiz application with user authentication, real-time scoring, and competitive leaderboards.

## Live Demo

**[https://quiz-grid.onrender.com](https://quiz-grid.onrender.com)**

## Features

### User Authentication
- Secure user registration and login
- JWT-based authentication with session fallback
- Password encryption with bcrypt
- Persistent login sessions

### Quiz System
- Customizable quiz length (1-10 questions)
- 20+ categories to choose from:
  - General Knowledge
  - Science & Nature
  - Science: Computers
  - Science: Mathematics
  - History
  - Geography
  - Sports
  - Entertainment (Film, Music, TV, Video Games, Books)
  - Art, Mythology, Politics, and more
- Questions sourced from Open Trivia Database API
- Multiple choice format (A, B, C, D)
- Progress tracking during quiz
- Back button protection to prevent accidental navigation

### Scoring & Results
- Real-time score calculation
- Detailed results showing correct/incorrect answers
- Time tracking for each quiz attempt
- Percentage-based scoring

### Leaderboard
- Global leaderboard with top 10 players
- Best score and average score tracking
- Total attempts counter
- Personal ranking display

### User Profile
- Quiz history with all past attempts
- Statistics dashboard (total quizzes, average score, best score)
- Account creation date

### User Experience
- Modern, responsive design
- Dark theme with gradient accents
- Mobile-friendly interface
- Real-time notifications
- Smooth animations and transitions

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Express Sessions
- **Session Store**: MongoDB (via connect-mongo)
- **API**: Open Trivia Database
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Hosting**: Render

## Deployment

This application is deployed on **Render**.

### Quick Deploy to Render

1. Push your code to GitHub
2. Connect your repository to Render
3. Set environment variables (see below)
4. Deploy!

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file:
   ```
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_session_secret
   JWT_SECRET=your_jwt_secret
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Visit `http://localhost:3000`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `SESSION_SECRET` | Yes | Secret for session encryption |
| `JWT_SECRET` | No | Secret for JWT tokens (defaults to SESSION_SECRET) |
| `NODE_ENV` | Auto | Set to `production` in production |
| `PORT` | Auto | Server port (defaults to 3000 locally) |

## Screenshots

### Landing Page

### Home Page
Customize your quiz with category selection and question count.

### Quiz Interface
Answer questions with a clean, distraction-free interface.

### Results Page
View detailed results with correct answers highlighted.

### Leaderboard
Compete with other players for the top spot.

## License

ISC
