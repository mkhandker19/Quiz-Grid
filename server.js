
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const connectDB = require('./config/database');
const User = require('./models/User');
const { getAllQuestions, getQuestionsExcludingUsed } = require('./utils/questions');
const app = express();
const PORT = process.env.PORT || 3000;


connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(session({
  secret: process.env.SESSION_SECRET || 'quiz-grid-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, 
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 
  }
}));


app.use(express.static(path.join(__dirname, 'public')));


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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is running!' });
});


app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide username, email, and password' 
      });
    }

    
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.trim() }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email already exists' 
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
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

   
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});


app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username and password'
      });
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

    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email
    };

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.'
    });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
    }

    res.clearCookie('connect.sid'); 
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


const initializeUsedQuestions = (req) => {
  if (!req.session.usedQuestionIndices) {
    req.session.usedQuestionIndices = [];
  }
};


app.get('/api/quiz/start', requireAuth, (req, res) => {
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
    console.error('Quiz start error:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting quiz. Please try again.'
    });
  }
});


app.post('/api/quiz/answer', requireAuth, (req, res) => {
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
    console.error('Quiz answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving answer. Please try again.'
    });
  }
});

app.post('/api/quiz/submit', requireAuth, (req, res) => {
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

    res.json({
      success: true,
      ...quizResults
    });

  } catch (error) {
    console.error('Quiz submit error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting quiz. Please try again.'
    });
  }
});

app.get('/api/quiz/results', requireAuth, (req, res) => {
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
    console.error('Quiz results error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving quiz results.'
    });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to see the app`);
});

