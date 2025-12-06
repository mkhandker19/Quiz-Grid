
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStoreModule = require('connect-mongo');
const MongoStore = MongoStoreModule.default || MongoStoreModule.MongoStore || MongoStoreModule;
const mongoose = require('mongoose');
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

