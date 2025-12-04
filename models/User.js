// User Model
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  quizAttempts: [{
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    correctCount: {
      type: Number,
      required: true
    },
    totalQuestions: {
      type: Number,
      required: true
    },
    incorrectCount: {
      type: Number,
      required: true
    },
    timeTaken: {
      type: Number,
      default: 0
    },
    date: {
      type: Date,
      default: Date.now
    },
    questions: [{
      questionNumber: Number,
      question: String,
      options: {
        A: String,
        B: String,
        C: String,
        D: String
      },
      userAnswer: String,
      correctAnswer: String,
      isCorrect: Boolean
    }]
  }]
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Hash password with cost of 10
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getBestScore = function() {
  if (this.quizAttempts.length === 0) return null;
  return Math.max(...this.quizAttempts.map(attempt => attempt.score));
};

userSchema.methods.getAverageScore = function() {
  if (this.quizAttempts.length === 0) return 0;
  const sum = this.quizAttempts.reduce((acc, attempt) => acc + attempt.score, 0);
  return (sum / this.quizAttempts.length).toFixed(2);
};

userSchema.methods.getTotalAttempts = function() {
  return this.quizAttempts.length;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

