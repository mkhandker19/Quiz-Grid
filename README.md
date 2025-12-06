# Quiz-Grid

A full-featured quiz application with user authentication, real-time scoring, and competitive leaderboards.

## Live Demo

**[https://quiz-grid.onrender.com](https://quiz-grid.onrender.com)**

## Team Members

| Name | Role |
|------|------|
| Mahin Khandker | Full Stack Developer |

### Contributions

- **Mahin Khandker**: Sole developer responsible for all aspects of the project including backend API development, database design, frontend UI/UX, user authentication, Trivia API integration, and deployment.

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
Animated landing page to introduce the Quiz site.
<img width="1919" height="945" alt="{37B62E0A-BD81-41A8-BE57-D65D3937BB0A}" src="https://github.com/user-attachments/assets/b6ea383d-533f-4dfe-94eb-962e24aea649" />

### Home Page
Customize your quiz with category selection and question count.
<img width="1914" height="946" alt="{CE4FDDF2-8C19-4516-BFBF-912ECF7E37C7}" src="https://github.com/user-attachments/assets/2b05c611-61e4-4f17-81a8-8f0d05cba287" />

### Quiz Interface
Answer questions with a clean, distraction-free interface.
<img width="1920" height="945" alt="{5DE9661F-4608-4995-8641-5EBCE2311F68}" src="https://github.com/user-attachments/assets/8cf540bf-8176-4e16-bba1-a428d8953903" />

### Results Page
View detailed results with correct answers highlighted.
<img width="1918" height="941" alt="{64E51D16-DEB5-42FA-B688-848D2C26D33A}" src="https://github.com/user-attachments/assets/bf8cd03e-c7bf-48f5-8402-49765c05783d" />

### Leaderboard
Compete with other players for the top spot.
<img width="1921" height="948" alt="{6A6F6997-E81A-4F86-9A35-6B747E5EC047}" src="https://github.com/user-attachments/assets/54323205-5c6f-4cd4-9b37-9ef5ed8e6e80" />

## License

ISC
