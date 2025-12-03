// Questions Utility - Load and manage quiz questions
const fs = require('fs');
const path = require('path');

// Store questions in memory
let questions = null;

/**
 * Load questions from JSON file
 * @returns {Array} Array of question objects
 */
function loadQuestions() {
  if (questions !== null) {
    // Questions already loaded, return cached version
    return questions;
  }

  try {
    const questionsPath = path.join(__dirname, '..', 'questions.json');
    const questionsData = fs.readFileSync(questionsPath, 'utf8');
    questions = JSON.parse(questionsData);
    
    console.log(`Loaded ${questions.length} questions from questions.json`);
    return questions;
  } catch (error) {
    console.error('Error loading questions:', error);
    throw new Error('Failed to load questions from JSON file');
  }
}

/**
 * Get all questions
 * @returns {Array} Array of all question objects
 */
function getAllQuestions() {
  if (questions === null) {
    loadQuestions();
  }
  return questions;
}

/**
 * Get a random set of questions
 * @param {number} count - Number of questions to return (default: 10)
 * @returns {Array} Array of randomly selected question objects
 */
function getRandomQuestions(count = 10) {
  if (questions === null) {
    loadQuestions();
  }

  if (count >= questions.length) {
    // If requesting more questions than available, return all shuffled
    return shuffleArray([...questions]);
  }

  // Shuffle and return requested number
  const shuffled = shuffleArray([...questions]);
  return shuffled.slice(0, count);
}

/**
 * Get questions excluding previously used ones
 * @param {Array} usedQuestionIds - Array of question indices that have been used
 * @param {number} count - Number of questions to return (default: 10)
 * @returns {Array} Array of question objects not in usedQuestionIds
 */
function getQuestionsExcludingUsed(usedQuestionIds = [], count = 10) {
  if (questions === null) {
    loadQuestions();
  }

  // Create array of available question indices
  const availableIndices = questions
    .map((_, index) => index)
    .filter(index => !usedQuestionIds.includes(index));

  if (availableIndices.length === 0) {
    // All questions have been used, reset and return random questions
    console.log('All questions have been used, resetting...');
    return getRandomQuestions(count);
  }

  // Shuffle available indices
  const shuffledIndices = shuffleArray([...availableIndices]);
  const selectedIndices = shuffledIndices.slice(0, Math.min(count, shuffledIndices.length));

  // Return questions with their indices
  return selectedIndices.map(index => ({
    ...questions[index],
    _index: index // Include original index for tracking
  }));
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get question by index
 * @param {number} index - Index of the question
 * @returns {Object|null} Question object or null if not found
 */
function getQuestionByIndex(index) {
  if (questions === null) {
    loadQuestions();
  }

  if (index >= 0 && index < questions.length) {
    return questions[index];
  }
  return null;
}

/**
 * Get total number of questions
 * @returns {number} Total number of questions available
 */
function getTotalQuestions() {
  if (questions === null) {
    loadQuestions();
  }
  return questions.length;
}

module.exports = {
  loadQuestions,
  getAllQuestions,
  getRandomQuestions,
  getQuestionsExcludingUsed,
  getQuestionByIndex,
  getTotalQuestions
};

