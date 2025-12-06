# Quiz-Grid

A quiz application with user authentication, scoring, and leaderboard features.

## Features

- User authentication (signup/login)
- Interactive quiz system
- Score tracking and leaderboard
- User profile with quiz history
- Session-based quiz state management

## Deployment

This application is optimized for deployment on **Render** (recommended) or Vercel.

### Quick Deploy to Render

1. Push your code to GitHub
2. Connect your repository to Render
3. Set environment variables (see `RENDER_DEPLOYMENT.md`)
4. Deploy!

For detailed deployment instructions, see [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md)

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

- `MONGODB_URI` - MongoDB connection string (required)
- `SESSION_SECRET` - Secret for session encryption (required)
- `JWT_SECRET` - Secret for JWT tokens (optional, defaults to SESSION_SECRET)
- `NODE_ENV` - Set to `production` in production (auto-set by platforms)
- `PORT` - Server port (auto-set by platforms, defaults to 3000 locally)

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Express Sessions
- **Session Store**: MongoDB (via connect-mongo)

## Why Render?

This application uses server-side sessions for quiz state management. Render's persistent server architecture provides:

- ✅ Reliable session persistence
- ✅ Better performance for session-based apps
- ✅ Simpler architecture (no serverless workarounds needed)
- ✅ Easier debugging and monitoring

## License

ISC