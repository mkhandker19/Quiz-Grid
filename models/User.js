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
  scores: [{
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 10
    },
    totalQuestions: {
      type: Number,
      default: 10
    },
    date: {
      type: Date,
      default: Date.now
    },
    questions: [{
      question: String,
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

// Method to get user's best score
userSchema.methods.getBestScore = function() {
  if (this.scores.length === 0) return null;
  return Math.max(...this.scores.map(score => score.score));
};

// Method to get user's average score
userSchema.methods.getAverageScore = function() {
  if (this.scores.length === 0) return 0;
  const sum = this.scores.reduce((acc, score) => acc + score.score, 0);
  return (sum / this.scores.length).toFixed(2);
};

const User = mongoose.model('User', userSchema);

module.exports = User;

