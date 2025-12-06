
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStoreModule = require('connect-mongo');
const MongoStore = MongoStoreModule.default || MongoStoreModule.MongoStore || MongoStoreModule;
const mongoose = require('mongoose');
const connectDB = require('./config/database');
const User = require('./models/User');
const { getAllQuestions, getQuestionsExcludingUsed } = require('./utils/questions');
const app = express();
const PORT = process.env.PORT || 3000;

let dbConnectionPromise = null;
const ensureDBConnection = async (req, res, next) => {
  try {
    if (!dbConnectionPromise) {
      dbConnectionPromise = connectDB();
    }
    await dbConnectionPromise;
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed. Please try again later.'
    });
  }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Determine if we're in production (Vercel sets VERCEL env var)
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

// Session configuration - works for both local and production
app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-grid-secret-key-change-in-production',
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600,
    ttl: 24 * 60 * 60,
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // false for local (HTTP), true for production (HTTPS)
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: isProduction ? 'none' : 'lax', // 'lax' for local, 'none' for production (cross-origin)
    path: '/' // Cookie available for all paths
  }
}));

// Log session configuration on startup (helpful for debugging)
if (!isProduction) {
  console.log('Session Configuration (Local):');
  console.log(`  - secure: false (HTTP allowed)`);
  console.log(`  - sameSite: lax (works with localhost)`);
  console.log(`  - httpOnly: true`);
} else {
  console.log('Session Configuration (Production):');
  console.log(`  - secure: true (HTTPS required)`);
  console.log(`  - sameSite: none (cross-origin support)`);
  console.log(`  - httpOnly: true`);
}

app.use(express.static(path.resolve(__dirname, 'public')));

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', '),
      errors: messages
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(400).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists. Please choose a different one.`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format.'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please login again.'
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred. Please try again later.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 handler for API routes
const notFoundHandler = (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found.'
    });
  }
  next();
};

// Request validation middleware
const validateRequest = (fields) => {
  return (req, res, next) => {
    const missingFields = [];
    const invalidFields = [];

    fields.forEach(field => {
      const value = req.body[field.name];
      
      if (field.required && (!value || (typeof value === 'string' && !value.trim()))) {
        missingFields.push(field.name);
      } else if (value && field.type && typeof value !== field.type) {
        invalidFields.push(field.name);
      } else if (value && field.minLength && value.length < field.minLength) {
        invalidFields.push(`${field.name} must be at least ${field.minLength} characters`);
      } else if (value && field.maxLength && value.length > field.maxLength) {
        invalidFields.push(`${field.name} must be no more than ${field.maxLength} characters`);
      } else if (value && field.pattern && !field.pattern.test(value)) {
        invalidFields.push(`${field.name} format is invalid`);
      }
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid fields: ${invalidFields.join(', ')}`,
        invalidFields
      });
    }

    next();
  };
};

const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please login.'
    });
  }
};

// Middleware to redirect authenticated users away from login/signup
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/index.html');
  }
  next();
};

// Middleware to redirect unauthenticated users to login
const redirectIfNotAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    return res.redirect('/login.html');
  }
};

// Root route
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

app.get('/index.html', redirectIfNotAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

app.get('/quiz.html', redirectIfNotAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'quiz.html'));
});

app.get('/results.html', redirectIfNotAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'results.html'));
});

app.get('/profile.html', redirectIfNotAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'profile.html'));
});

app.get('/leaderboard.html', redirectIfNotAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'leaderboard.html'));
});

app.get('/login.html', redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'login.html'));
});

app.get('/signup.html', redirectIfAuthenticated, (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'signup.html'));
});

app.use('/api', ensureDBConnection);

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});


app.post('/api/signup', validateRequest([
  { name: 'username', required: true, type: 'string', minLength: 3, maxLength: 30 },
  { name: 'email', required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { name: 'password', required: true, type: 'string', minLength: 6, maxLength: 100 }
]), async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.trim() }]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ 
          success: false, 
          message: 'An account with this email already exists. Please use a different email or try logging in.' 
        });
      }
      if (existingUser.username === username.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'This username is already taken. Please choose a different username.' 
        });
      }
    }

    
    const user = new User({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: password
    });

    await user.save();

    
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse
    });

  } catch (error) {
    next(error);
  }
});


app.post('/api/login', validateRequest([
  { name: 'email', required: true, type: 'string' },
  { name: 'password', required: true, type: 'string', minLength: 1 }
]), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Debug logging for localhost
    if (!isProduction) {
      console.log('Login attempt for:', email);
    }

    const user = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { username: email.trim() }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password'
      });
    }

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    req.session.email = user.email;

    // Explicitly save session to ensure it's persisted (works in both local and production)
    // Use promise-based approach for better async handling
    try {
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            reject(err);
          } else {
            if (!isProduction) {
              console.log('Session saved successfully for user:', user.username);
            }
            resolve();
          }
        });
      });
    } catch (sessionError) {
      // Log the error but don't fail the login - session might still work
      console.error('Session save failed, but continuing with login:', sessionError);
      // The session data is already set, so we'll proceed
      // In some cases, the session might still work even if save callback fails
    }

    // Verify session was set
    if (!req.session.userId) {
      console.error('Session userId not set after login attempt');
      return res.status(500).json({
        success: false,
        message: 'Failed to create session. Please try again.'
      });
    }

    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email
    };

    if (!isProduction) {
      console.log('Sending login success response for user:', user.username);
      console.log('Session userId:', req.session.userId);
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse
    });

  } catch (error) {
    next(error);
  }
});

app.post('/api/logout', (req, res) => {
  // Get the session cookie name before destroying the session
  // Default express-session cookie name is 'connect.sid'
  const sessionCookieName = (req.session && req.session.cookie) 
    ? req.session.cookie.name 
    : 'connect.sid';
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
    }

    // Clear the session cookie with proper settings matching the session configuration
    // This ensures it works in both local and production
    res.clearCookie(sessionCookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 0 // Immediately expire the cookie
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

app.get('/api/auth/status', requireAuth, (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: {
      id: req.session.userId,
      username: req.session.username,
      email: req.session.email
    }
  });
});

app.get('/api/user/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const totalAttempts = user.quizAttempts.length;
    const bestScore = user.getBestScore();
    const averageScore = user.getAverageScore();

    const history = user.quizAttempts
      .map(attempt => ({
        score: attempt.score,
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        incorrectCount: attempt.incorrectCount,
        timeTaken: attempt.timeTaken,
        date: attempt.date
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      },
      stats: {
        totalQuizzes: totalAttempts,
        averageScore: averageScore ? parseFloat(averageScore) : null,
        bestScore: bestScore
      },
      history: history
    });

  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboard', requireAuth, async (req, res, next) => {
  try {
    const allUsers = await User.find().select('username quizAttempts');
    
    const playersWithScores = allUsers
      .map(user => {
        const bestScore = user.getBestScore();
        const averageScore = user.getAverageScore();
        const totalAttempts = user.quizAttempts.length;
        
        if (totalAttempts === 0) {
          return null;
        }
        
        return {
          username: user.username,
          bestScore: bestScore,
          averageScore: averageScore ? parseFloat(averageScore) : null,
          totalAttempts: totalAttempts
        };
      })
      .filter(player => player !== null)
      .sort((a, b) => {
        if (b.bestScore === null && a.bestScore === null) return 0;
        if (b.bestScore === null) return -1;
        if (a.bestScore === null) return 1;
        return b.bestScore - a.bestScore;
      });

    const top10 = playersWithScores.slice(0, 10);

    let currentUserRank = null;
    let currentUserData = null;
    
    if (req.session.userId) {
      const currentUser = await User.findById(req.session.userId);
      if (currentUser) {
        const currentUserBestScore = currentUser.getBestScore();
        const currentUserAvgScore = currentUser.getAverageScore();
        const currentUserAttempts = currentUser.quizAttempts.length;
        
        currentUserRank = playersWithScores.findIndex(
          player => player.username === currentUser.username
        ) + 1;
        
        if (currentUserRank === 0) {
          currentUserRank = null;
        }
        
        currentUserData = {
          username: currentUser.username,
          rank: currentUserRank,
          bestScore: currentUserBestScore,
          averageScore: currentUserAvgScore ? parseFloat(currentUserAvgScore) : null,
          totalAttempts: currentUserAttempts
        };
      }
    }

    res.json({
      success: true,
      leaderboard: top10,
      currentUser: currentUserData
    });

  } catch (error) {
    next(error);
  }
});

const initializeUsedQuestions = (req) => {
  if (!req.session.usedQuestionIndices) {
    req.session.usedQuestionIndices = [];
  }
};


app.get('/api/quiz/start', requireAuth, (req, res, next) => {
  try {
    initializeUsedQuestions(req);

    const selectedQuestions = getQuestionsExcludingUsed(
      req.session.usedQuestionIndices,
      10
    );

    
    const selectedIndices = selectedQuestions.map(q => q._index);

   
    req.session.usedQuestionIndices = [
      ...req.session.usedQuestionIndices,
      ...selectedIndices
    ];

   
    req.session.currentQuiz = {
      questions: selectedQuestions.map(q => {
        const { _index, ...question } = q;
        return question;
      }),
      questionIndices: selectedIndices,
      answers: {},
      currentQuestionIndex: 0,
      startTime: new Date()
    };

    const formattedQuestions = selectedQuestions.map((q, index) => {
      const { _index, answer, ...questionData } = q;
      return {
        questionNumber: index + 1,
        question: questionData.question,
        options: {
          A: questionData.A,
          B: questionData.B,
          C: questionData.C,
          D: questionData.D
        }
      };
    });

    res.json({
      success: true,
      questions: formattedQuestions,
      totalQuestions: formattedQuestions.length
    });

  } catch (error) {
    next(error);
  }
});


app.post('/api/quiz/answer', requireAuth, (req, res, next) => {
  try {
    if (!req.session.currentQuiz) {
      return res.status(400).json({
        success: false,
        message: 'No active quiz session. Please start a quiz first.'
      });
    }

    const { questionIndex, answer } = req.body;

    if (questionIndex === undefined || answer === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide questionIndex and answer'
      });
    }

    const quiz = req.session.currentQuiz;
    const totalQuestions = quiz.questions.length;

    if (questionIndex < 0 || questionIndex >= totalQuestions) {
      return res.status(400).json({
        success: false,
        message: `Invalid question index. Must be between 0 and ${totalQuestions - 1}`
      });
    }

    quiz.answers[questionIndex] = answer;
    quiz.currentQuestionIndex = questionIndex;

    res.json({
      success: true,
      message: 'Answer saved successfully',
      currentQuestionIndex: quiz.currentQuestionIndex,
      totalQuestions: totalQuestions
    });

  } catch (error) {
    next(error);
  }
});

app.post('/api/quiz/submit', requireAuth, async (req, res, next) => {
  try {
    if (!req.session.currentQuiz) {
      return res.status(400).json({
        success: false,
        message: 'No active quiz session. Please start a quiz first.'
      });
    }

    const quiz = req.session.currentQuiz;
    const userAnswers = quiz.answers;
    const questions = quiz.questions;
    
    let correctCount = 0;
    let totalQuestions = questions.length;
    const results = [];

    questions.forEach((question, index) => {
      const userAnswer = userAnswers[index];
      const correctAnswer = question.answer;
      const isCorrect = userAnswer === correctAnswer;
      
      if (isCorrect) {
        correctCount++;
      }

      results.push({
        questionNumber: index + 1,
        question: question.question,
        options: {
          A: question.A,
          B: question.B,
          C: question.C,
          D: question.D
        },
        userAnswer: userAnswer || null,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect
      });
    });

    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const endTime = new Date();
    const timeTaken = Math.round((endTime - new Date(quiz.startTime)) / 1000);

    const quizResults = {
      score: score,
      correctCount: correctCount,
      totalQuestions: totalQuestions,
      incorrectCount: totalQuestions - correctCount,
      timeTaken: timeTaken,
      results: results,
      submittedAt: endTime
    };

    req.session.quizResults = quizResults;
    req.session.currentQuiz = null;

    try {
      const user = await User.findById(req.session.userId);
      if (user) {
        user.quizAttempts.push({
          score: score,
          correctCount: correctCount,
          totalQuestions: totalQuestions,
          incorrectCount: totalQuestions - correctCount,
          timeTaken: timeTaken,
          date: endTime,
          questions: results
        });
        await user.save();
      }
    } catch (saveError) {
      console.error('Error saving quiz attempt to database:', saveError);
    }

    res.json({
      success: true,
      ...quizResults
    });

  } catch (error) {
    next(error);
  }
});

app.post('/api/quiz/save', requireAuth, async (req, res, next) => {
  try {
    if (!req.session.quizResults) {
      return res.status(400).json({
        success: false,
        message: 'No quiz results to save. Please complete a quiz first.'
      });
    }

    const quizResults = req.session.quizResults;
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    user.quizAttempts.push({
      score: quizResults.score,
      correctCount: quizResults.correctCount,
      totalQuestions: quizResults.totalQuestions,
      incorrectCount: quizResults.incorrectCount,
      timeTaken: quizResults.timeTaken,
      date: quizResults.submittedAt || new Date(),
      questions: quizResults.results
    });

    await user.save();

    res.json({
      success: true,
      message: 'Quiz attempt saved successfully',
      attemptId: user.quizAttempts[user.quizAttempts.length - 1]._id
    });

  } catch (error) {
    next(error);
  }
});

app.get('/api/quiz/results', requireAuth, (req, res, next) => {
  try {
    if (!req.session.quizResults) {
      return res.status(404).json({
        success: false,
        message: 'No quiz results found. Please complete a quiz first.'
      });
    }

    res.json({
      success: true,
      ...req.session.quizResults
    });

  } catch (error) {
    next(error);
  }
});

app.post('/api/quiz/reset', requireAuth, (req, res) => {
  req.session.usedQuestionIndices = [];
  req.session.currentQuiz = null;
  req.session.quizResults = null;
  res.json({
    success: true,
    message: 'Quiz history reset successfully'
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to see the app`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
    console.log(`Session secure: ${isProduction}, sameSite: ${isProduction ? 'none' : 'lax'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use.`);
      console.error(`Please either:`);
      console.error(`  1. Stop the other process using port ${PORT}`);
      console.error(`  2. Set PORT environment variable to use a different port (e.g., PORT=3001)`);
      console.error(`\nTo find what's using port ${PORT}, run:`);
      console.error(`  Windows: netstat -ano | findstr :${PORT}`);
      console.error(`  Mac/Linux: lsof -i :${PORT}\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

module.exports = app;

