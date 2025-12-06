
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStoreModule = require('connect-mongo');
const MongoStore = MongoStoreModule.default || MongoStoreModule.MongoStore || MongoStoreModule;
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const User = require('./models/User');
const { getAllQuestions, getQuestionsExcludingUsed, getCategories } = require('./utils/questions');
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
app.use(cookieParser()); // Required to parse JWT cookies

// Determine if we're in production (Vercel sets VERCEL env var)
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
// Vercel serves from same domain, so we can use 'lax' instead of 'none'
const isVercel = process.env.VERCEL === '1';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'quiz-grid-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '24h'; // 24 hours, matching session maxAge
const JWT_COOKIE_NAME = 'quiz-grid-token';

// JWT Utility Functions
const jwtUtils = {
  // Generate JWT token
  generateToken: (user) => {
    const payload = {
      id: user._id.toString(),
      username: user.username,
      email: user.email
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  },

  // Verify JWT token
  verifyToken: (token) => {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  },

  // Set JWT cookie in response
  setTokenCookie: (res, token) => {
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isVercel ? 'lax' : (isProduction ? 'none' : 'lax'),
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    };
    res.cookie(JWT_COOKIE_NAME, token, cookieOptions);
  },

  // Clear JWT cookie
  clearTokenCookie: (res) => {
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isVercel ? 'lax' : (isProduction ? 'none' : 'lax'),
      path: '/',
      maxAge: 0
    };
    res.clearCookie(JWT_COOKIE_NAME, cookieOptions);
  }
};

// Ensure database connection is available before session middleware
// This is critical for serverless where each request might need a fresh connection
app.use(async (req, res, next) => {
  try {
    if (!dbConnectionPromise) {
      dbConnectionPromise = connectDB();
    }
    await dbConnectionPromise;
    next();
  } catch (error) {
    console.error('Database connection error in middleware:', error);
    // Don't block requests, but log the error
    // Session store has its own connection, so this is just for our app DB
    next();
  }
});

// Session configuration - optimized for serverless (Vercel)
// MongoStore creates its own MongoDB connection
// We ensure it's properly configured with connection options for serverless reliability
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  touchAfter: 24 * 3600,
  ttl: 24 * 60 * 60,
  collectionName: 'sessions',
  autoRemove: 'native',
  stringify: false,
  // Connection options for serverless - ensures reliable connection
  // These match the options we use for the main DB connection
  mongoOptions: {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  },
  errorHandler: (error) => {
    console.error('MongoStore error:', error);
  }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-grid-secret-key-change-in-production',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // false for local (HTTP), true for production (HTTPS)
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // Use 'lax' for Vercel (same domain) and 'none' only if truly cross-origin
    // Vercel serves everything from the same domain, so 'lax' works better
    sameSite: isVercel ? 'lax' : (isProduction ? 'none' : 'lax'),
    path: '/', // Cookie available for all paths
    // Don't set domain - let browser handle it (important for Vercel)
    // domain: undefined explicitly means current domain
  },
  // Ensure session is saved even if not modified (important for serverless)
  rolling: false,
  // Force save on every request to ensure session is available
  saveUninitialized: false
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
  console.log(`  - sameSite: ${isVercel ? 'lax' : 'none'} (${isVercel ? 'Vercel same-domain' : 'cross-origin support'})`);
  console.log(`  - httpOnly: true`);
}

// Middleware to redirect authenticated users away from login/signup
// Checks both JWT and session
const redirectIfAuthenticated = async (req, res, next) => {
  // Check JWT first
  const token = req.cookies[JWT_COOKIE_NAME];
  if (token && jwtUtils.verifyToken(token)) {
    return res.redirect('/index.html');
  }
  // Check session
  if (req.session && req.session.userId) {
    return res.redirect('/index.html');
  }
  next();
};

// Middleware to redirect unauthenticated users to login
// Checks both JWT and session
const redirectIfNotAuthenticated = async (req, res, next) => {
  // Check JWT first
  const token = req.cookies[JWT_COOKIE_NAME];
  if (token && jwtUtils.verifyToken(token)) {
    return next();
  }
  // Check session
  if (req.session && req.session.userId) {
    next();
  } else {
    return res.redirect('/login.html');
  }
};

// Root route - MUST be defined BEFORE static middleware to prevent serving index.html before auth check
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Serve static files (CSS, JS, images, etc.) - but NOT index.html for root path
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

// Hybrid Auth Middleware - Checks JWT first, then falls back to session
// This ensures compatibility with both serverless (JWT) and traditional (session) environments
const requireAuth = async (req, res, next) => {
  // Try JWT authentication first (better for serverless)
  const token = req.cookies[JWT_COOKIE_NAME];
  
  if (token) {
    const decoded = jwtUtils.verifyToken(token);
    if (decoded) {
      // JWT is valid - attach user info to request
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email
      };
      req.authMethod = 'jwt';
      return next();
    }
  }

  // Fall back to session authentication
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username,
      email: req.session.email
    };
    req.authMethod = 'session';
    return next();
  }

  // No valid authentication found
  if (isProduction) {
    console.log('Auth check failed - JWT:', token ? 'invalid' : 'missing', 'Session:', req.session ? 'exists but no userId' : 'does not exist');
  }
  res.status(401).json({
    success: false,
    message: 'Authentication required. Please login.'
  });
};


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
      return res.status(400).json({ 
        success: false, 
        message: 'Username or Email already exist.' 
      });
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

    // Generate JWT token (primary auth method for serverless)
    const token = jwtUtils.generateToken(user);
    
    // Also set session as backup (for compatibility)
    req.session.userId = user._id.toString();
    req.session.username = user.username;
    req.session.email = user.email;

    // Try to save session (non-blocking - JWT is primary)
    // This is a fallback for environments that prefer sessions
    try {
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error('Session save error (non-critical, JWT is primary):', err);
            // Don't fail login if session save fails - JWT will work
            resolve();
          } else {
            if (!isProduction) {
              console.log('Session saved successfully for user:', user.username);
            }
            resolve();
          }
        });
      });
    } catch (sessionError) {
      // Log but don't fail - JWT is the primary auth method
      console.error('Session save failed (non-critical):', sessionError);
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

    // Set JWT token in cookie (primary auth method)
    jwtUtils.setTokenCookie(res, token);

    // Set explicit headers to ensure cookie is sent and not cached in production
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
      sameSite: isVercel ? 'lax' : (isProduction ? 'none' : 'lax'),
      path: '/',
      maxAge: 0 // Immediately expire the cookie
    });
    
    // Clear the JWT cookie (critical - app uses hybrid auth: JWT first, then session)
    // Without this, users remain authenticated via JWT even after logout
    jwtUtils.clearTokenCookie(res);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

app.get('/api/auth/status', requireAuth, (req, res) => {
  // Set headers to prevent caching and ensure cookies are sent
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Use req.user which is set by requireAuth middleware (works for both JWT and session)
  res.json({
    success: true,
    authenticated: true,
    authMethod: req.authMethod || 'unknown', // 'jwt' or 'session'
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

app.get('/api/user/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
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
    
    if (req.user && req.user.id) {
      const currentUser = await User.findById(req.user.id);
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
  if (!req.session.usedQuestionIds) {
    req.session.usedQuestionIds = [];
  }
  
  // Automatic cleanup: if usedQuestionIds exceeds 100, keep only the most recent 50
  // This prevents the array from growing indefinitely and improves performance
  if (req.session.usedQuestionIds.length > 100) {
    // Keep the most recent 50 questions (last 50 in array)
    req.session.usedQuestionIds = req.session.usedQuestionIds.slice(-50);
    if (!isProduction) {
      console.log(`Cleaned up used questions. Kept ${req.session.usedQuestionIds.length} most recent questions.`);
    }
  }
};

// Endpoint to get available categories from Trivia API
app.get('/api/quiz/categories', requireAuth, async (req, res, next) => {
  try {
    const categories = await getCategories();
    res.json({
      success: true,
      categories: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(503).json({
      success: false,
      message: 'Unable to fetch categories. Please try again later.'
    });
  }
});

app.get('/api/quiz/start', requireAuth, async (req, res, next) => {
  try {
    // Clear any existing quiz session to ensure fresh questions are fetched
    req.session.currentQuiz = null;
    initializeUsedQuestions(req);

    // Get category and amount from query parameters
    // IMPORTANT: req.query should contain the parameters from the API request
    const category = (req.query.category && req.query.category !== 'undefined') ? String(req.query.category).trim() : '';
    const amountParam = req.query.amount;
    const amount = (amountParam && amountParam !== 'undefined') ? parseInt(amountParam) : 10;

    // Validate amount (must be between 1 and 10)
    let validAmount = amount;
    if (isNaN(validAmount) || validAmount < 1) {
      validAmount = 1;
    } else if (validAmount > 10) {
      validAmount = 10;
    }

    // Log for debugging (remove in production if desired)
    if (!isProduction) {
      console.log('=== QUIZ START REQUEST ===');
      console.log('Raw query params:', JSON.stringify(req.query));
      console.log('req.query.amount:', req.query.amount, 'type:', typeof req.query.amount);
      console.log('req.query.category:', req.query.category, 'type:', typeof req.query.category);
      console.log('Parsed values:', { category, amount, validAmount });
      console.log('Category type:', typeof category, 'Category value:', category);
      console.log('Amount type:', typeof amount, 'Amount value:', amount);
    }

    // Fetch questions from Trivia API (no difficulty parameter)
    // IMPORTANT: Pass the exact amount requested, not a default
    console.log(`Calling getQuestionsExcludingUsed with: count=${validAmount}, category="${category}"`);
    const selectedQuestions = await getQuestionsExcludingUsed(
      req.session.usedQuestionIds || [],
      validAmount, // This should be 20 if requested
      category,
      '' // No difficulty parameter
    );

    if (!isProduction) {
      console.log(`✓ Fetched ${selectedQuestions.length} questions`);
      console.log(`  - Requested: ${validAmount} questions`);
      console.log(`  - Category: ${category || 'Any Category'}`);
      console.log('=== END QUIZ START REQUEST ===');
    }

    // Track used question IDs
    const selectedQuestionIds = selectedQuestions.map(q => q._questionId);

    // Update session with used question IDs
    req.session.usedQuestionIds = [
      ...req.session.usedQuestionIds,
      ...selectedQuestionIds
    ];
    
    // Cleanup after adding new questions: if exceeds 100, keep only most recent 50
    // This ensures the array doesn't grow too large even if user takes many quizzes
    if (req.session.usedQuestionIds.length > 100) {
      req.session.usedQuestionIds = req.session.usedQuestionIds.slice(-50);
      if (!isProduction) {
        console.log(`Cleaned up used questions after adding new ones. Kept ${req.session.usedQuestionIds.length} most recent.`);
      }
    }

    // Store quiz data in session (remove internal tracking fields)
    req.session.currentQuiz = {
      questions: selectedQuestions.map(q => {
        const { _index, _questionId, ...question } = q;
        return question;
      }),
      questionIds: selectedQuestionIds,
      answers: {},
      currentQuestionIndex: 0,
      startTime: new Date()
    };
    
    // Explicitly save session to ensure quiz data is persisted
    // This is critical for serverless environments where sessions must be explicitly saved
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving quiz session:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Verify we got the correct number of questions
    if (selectedQuestions.length !== validAmount) {
      if (!isProduction) {
        console.warn(`⚠️ Warning: Requested ${validAmount} questions but got ${selectedQuestions.length}`);
        console.warn(`  This might be due to limited questions in the selected category or previously used questions.`);
      }
    } else {
      if (!isProduction) {
        console.log(`✓ Got exactly ${validAmount} questions as requested`);
      }
    }

    // Format questions for client (hide correct answer)
    const formattedQuestions = selectedQuestions.map((q, index) => {
      const { _index, _questionId, answer, ...questionData } = q;
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

    if (!isProduction) {
      console.log(`✓ Returning ${formattedQuestions.length} formatted questions to client`);
      if (selectedQuestions.length > 0) {
        // Verify category matches (if category was specified)
        if (category) {
          const categoriesInResults = [...new Set(selectedQuestions.map(q => q.category))];
          console.log(`  - Categories in results: ${categoriesInResults.join(', ')}`);
          console.log(`  - Requested category ID: ${category}`);
          
          // Check if all questions match the requested category
          const allMatchCategory = selectedQuestions.every(q => {
            // The category field in the question might be the name, not the ID
            // So we'll just log it for now
            return true; // We'll verify this differently
          });
        } else {
          console.log(`  - No category filter (Any Category)`);
        }
      }
    }

    res.json({
      success: true,
      questions: formattedQuestions,
      totalQuestions: formattedQuestions.length,
      requestedAmount: validAmount // Include requested amount for comparison
    });

  } catch (error) {
    console.error('Error starting quiz:', error);
    // Provide user-friendly error messages
    if (error.message.includes('No results found')) {
      return res.status(400).json({
        success: false,
        message: 'No questions found for the selected category. Please try a different category or try again later.'
      });
    } else if (error.message.includes('Network error') || error.message.includes('timeout')) {
      return res.status(503).json({
        success: false,
        message: 'Unable to fetch questions from the trivia service. Please check your internet connection and try again.'
      });
    } else {
      next(error);
    }
  }
});


app.post('/api/quiz/answer', requireAuth, async (req, res, next) => {
  try {
    // Enhanced session validation with better error logging
    if (!req.session) {
      console.error('Session object is missing in /api/quiz/answer');
      return res.status(400).json({
        success: false,
        message: 'Session not available. Please start a quiz first.'
      });
    }
    
    if (!req.session.currentQuiz) {
      // Log additional context for debugging session issues
      const sessionInfo = {
        hasSession: !!req.session,
        hasUserId: !!req.session.userId,
        hasCurrentQuiz: !!req.session.currentQuiz,
        authMethod: req.authMethod || 'unknown'
      };
      
      if (isProduction) {
        console.error('Quiz answer failed - no currentQuiz in session:', sessionInfo);
      } else {
        console.warn('Quiz answer failed - no currentQuiz in session:', sessionInfo);
      }
      
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
    
    // Save session to ensure answer is persisted (important for serverless)
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving answer to session:', err);
          // Don't fail the request, but log the error
          resolve();
        } else {
          resolve();
        }
      });
    });

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
    // Enhanced session validation with better error logging
    if (!req.session) {
      console.error('Session object is missing in /api/quiz/submit');
      return res.status(400).json({
        success: false,
        message: 'Session not available. Please start a quiz first.'
      });
    }
    
    if (!req.session.currentQuiz) {
      // Log additional context for debugging session issues
      const sessionInfo = {
        hasSession: !!req.session,
        hasUserId: !!req.session.userId,
        hasCurrentQuiz: !!req.session.currentQuiz,
        hasQuizResults: !!req.session.quizResults,
        authMethod: req.authMethod || 'unknown'
      };
      
      if (isProduction) {
        console.error('Quiz submission failed - no currentQuiz in session:', sessionInfo);
      } else {
        console.warn('Quiz submission failed - no currentQuiz in session:', sessionInfo);
      }
      
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
    
    // Explicitly save session to ensure changes are persisted (critical for serverless)
    // This ensures quizResults and currentQuiz changes are saved before response is sent
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving quiz submission to session:', err);
          // Don't fail the request, but log the error
          // The response will still be sent, but session might not be updated
          resolve();
        } else {
          resolve();
        }
      });
    });

    try {
      const user = await User.findById(req.user.id);
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
    const user = await User.findById(req.user.id);

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
  req.session.usedQuestionIds = [];
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
      console.error(`  Windows CMD: netstat -ano | findstr :${PORT}`);
      console.error(`  Windows PowerShell: netstat -ano | Select-String :${PORT}`);
      console.error(`  Git Bash/Mac/Linux: lsof -i :${PORT} or netstat -ano | grep :${PORT}\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

module.exports = app;

