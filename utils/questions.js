const fs = require('fs');
const path = require('path');

let questions = null;

function loadQuestions() {
  if (questions !== null) {
    return questions;
  }

  try {
    const questionsPath = path.resolve(__dirname, '..', 'questions.json');
    
    if (!fs.existsSync(questionsPath)) {
      throw new Error(`Questions file not found at: ${questionsPath}`);
    }
    
    const questionsData = fs.readFileSync(questionsPath, 'utf8');
    questions = JSON.parse(questionsData);
    
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Questions file is empty or invalid format');
    }
    
    console.log(`Loaded ${questions.length} questions from questions.json`);
    return questions;
  } catch (error) {
    console.error('Error loading questions:', error);
    console.error('Attempted path:', path.resolve(__dirname, '..', 'questions.json'));
    throw new Error(`Failed to load questions from JSON file: ${error.message}`);
  }
}

function getAllQuestions() {
  if (questions === null) {
    loadQuestions();
  }
  return questions;
}

function getRandomQuestions(count = 10) {
  if (questions === null) {
    loadQuestions();
  }

  if (count >= questions.length) {
    return shuffleArray([...questions]);
  }

  const shuffled = shuffleArray([...questions]);
  return shuffled.slice(0, count);
}

function getQuestionsExcludingUsed(usedQuestionIds = [], count = 10) {
  if (questions === null) {
    loadQuestions();
  }

  const availableIndices = questions
    .map((_, index) => index)
    .filter(index => !usedQuestionIds.includes(index));

  if (availableIndices.length === 0) {
    console.log('All questions have been used, resetting...');
    return getRandomQuestions(count);
  }

  const shuffledIndices = shuffleArray([...availableIndices]);
  const selectedIndices = shuffledIndices.slice(0, Math.min(count, shuffledIndices.length));

  return selectedIndices.map(index => ({
    ...questions[index],
    _index: index
  }));
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getQuestionByIndex(index) {
  if (questions === null) {
    loadQuestions();
  }

  if (index >= 0 && index < questions.length) {
    return questions[index];
  }
  return null;
}

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
