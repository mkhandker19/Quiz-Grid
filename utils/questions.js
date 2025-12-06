const https = require('https');
const { URL } = require('url');

// Trivia API base URL
const TRIVIA_API_BASE = 'https://opentdb.com/api.php';

// Default category (0 = Any Category)
const DEFAULT_CATEGORY = '';

// Cache for decoded HTML entities
const htmlEntities = {
  '&quot;': '"',
  '&#039;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&apos;': "'"
};

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text) {
  if (!text) return text;
  return text.replace(/&[#\w]+;/g, (entity) => {
    return htmlEntities[entity] || entity;
  });
}

/**
 * Fetch questions from Trivia API
 * @param {number} amount - Number of questions to fetch
 * @param {string|number} category - Category ID (optional, empty string for any)
 * @param {string} difficulty - Difficulty level: 'easy', 'medium', 'hard' (optional)
 * @param {string} type - Question type: 'multiple' or 'boolean' (default: 'multiple')
 * @returns {Promise<Array>} Array of questions
 */
async function fetchQuestionsFromAPI(amount = 10, category = '', difficulty = '', type = 'multiple') {
  return new Promise((resolve, reject) => {
    try {
      // Build URL with query parameters
      const url = new URL(TRIVIA_API_BASE);
      url.searchParams.set('amount', amount.toString());
      url.searchParams.set('type', type);
      
      if (category && category !== '') {
        url.searchParams.set('category', category.toString());
      }
      
      if (difficulty && difficulty !== '') {
        url.searchParams.set('difficulty', difficulty);
      }

      // Log the actual API URL being called
      const apiUrlString = url.toString();
      console.log('=== TRIVIA API CALL ===');
      console.log('Full URL:', apiUrlString);
      console.log('Parameters:');
      console.log('  - amount:', amount);
      console.log('  - category:', category || '(none - Any Category)');
      console.log('  - difficulty:', difficulty || '(none)');
      console.log('  - type:', type);

      // Make HTTPS request
      const request = https.get(url.toString(), (res) => {
        let data = '';

        // Collect response data
        res.on('data', (chunk) => {
          data += chunk;
        });

        // Parse response when complete
        res.on('end', () => {
          clearTimeout(timeout); // Clear timeout on successful completion
          try {
            const response = JSON.parse(data);

            // Check response code
            // 0 = Success
            // 1 = No Results
            // 2 = Invalid Parameter
            // 3 = Token Not Found
            // 4 = Token Empty
            if (response.response_code !== 0) {
              let errorMessage = 'Failed to fetch questions from Trivia API';
              
              switch (response.response_code) {
                case 1:
                  errorMessage = 'No results found for the specified parameters. Try a different category or difficulty.';
                  break;
                case 2:
                  errorMessage = 'Invalid parameter in API request.';
                  break;
                case 3:
                  errorMessage = 'Session token not found.';
                  break;
                case 4:
                  errorMessage = 'Session token has returned all available questions.';
                  break;
              }
              
              reject(new Error(errorMessage));
              return;
            }

            if (!response.results || !Array.isArray(response.results) || response.results.length === 0) {
              reject(new Error('No questions returned from Trivia API'));
              return;
            }

            console.log(`✓ API returned ${response.results.length} questions`);
            if (response.results.length > 0 && category) {
              // Log the category of the first question to verify
              console.log(`  - First question category: "${response.results[0].category}"`);
            }
            console.log('=== END API CALL ===');

            resolve(response.results);
          } catch (parseError) {
            reject(new Error(`Failed to parse API response: ${parseError.message}`));
          }
        });
      });

      // Handle request errors
      request.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Network error fetching questions: ${error.message}`));
      });

      // Set timeout for the request (10 seconds)
      const timeout = setTimeout(() => {
        request.destroy(); // Abort the request
        reject(new Error('Request timeout: Trivia API did not respond in time'));
      }, 10000);
    } catch (error) {
      reject(new Error(`Error constructing API request: ${error.message}`));
    }
  });
}

/**
 * Transform Trivia API question format to our application format
 * @param {Object} apiQuestion - Question from Trivia API
 * @param {number} index - Index for tracking
 * @returns {Object} Transformed question
 */
function transformQuestion(apiQuestion, index = null) {
  // Decode HTML entities
  const question = decodeHtmlEntities(apiQuestion.question);
  const correctAnswer = decodeHtmlEntities(apiQuestion.correct_answer);
  const incorrectAnswers = apiQuestion.incorrect_answers.map(ans => decodeHtmlEntities(ans));

  // Combine all answers and shuffle them
  const allAnswers = [correctAnswer, ...incorrectAnswers];
  const shuffled = shuffleArray([...allAnswers]);

  // Find the position of the correct answer after shuffling
  const correctIndex = shuffled.findIndex(ans => ans === correctAnswer);
  const answerKey = ['A', 'B', 'C', 'D'][correctIndex];

  // Create question object in our format
  const transformedQuestion = {
    question: question,
    A: shuffled[0] || '',
    B: shuffled[1] || '',
    C: shuffled[2] || '',
    D: shuffled[3] || '',
    answer: answerKey,
    category: apiQuestion.category,
    difficulty: apiQuestion.difficulty,
    type: apiQuestion.type
  };

  // Add index if provided (for tracking used questions)
  if (index !== null) {
    transformedQuestion._index = index;
  }

  // Add a unique identifier based on question text for tracking
  transformedQuestion._questionId = question.toLowerCase().replace(/\s+/g, '').substring(0, 50);

  return transformedQuestion;
}

/**
 * Shuffle array using Fisher-Yates algorithm
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
 * Get questions from Trivia API, excluding previously used questions
 * @param {Array} usedQuestionIds - Array of question IDs that have been used
 * @param {number} count - Number of questions to fetch
 * @param {string|number} category - Category ID (optional)
 * @param {string} difficulty - Difficulty level (optional)
 * @returns {Promise<Array>} Array of questions
 */
async function getQuestionsExcludingUsed(usedQuestionIds = [], count = 10, category = '', difficulty = '') {
  try {
    // Ensure category is a string (can be empty or a number as string)
    const categoryParam = category ? String(category).trim() : '';
    
    // Calculate how many questions we need to fetch
    // Always fetch at least the requested amount, and more if we need to account for used questions
    const usedCount = usedQuestionIds.length;
    let fetchAmount = count;
    
    // Always fetch at least the requested amount, and more if there are used questions to filter out
    // For categories, we might need to fetch more since some categories have limited questions
    if (usedCount > 0) {
      // Fetch more to account for duplicates that will be filtered out
      fetchAmount = Math.min(count + Math.max(usedCount, 10), 50); // API max is 50
    } else {
      // No used questions, but fetch the exact amount requested
      // If category is specified, we'll handle getting more if needed
      fetchAmount = count;
    }
    
    console.log(`Fetching ${fetchAmount} questions from API (requested: ${count}, category: ${categoryParam || 'Any'}, used: ${usedCount})`);
    
    let apiQuestions = await fetchQuestionsFromAPI(fetchAmount, categoryParam, difficulty);
    
    if (!apiQuestions || apiQuestions.length === 0) {
      throw new Error(`No questions returned from API for category: ${categoryParam || 'Any'}`);
    }
    
    console.log(`API returned ${apiQuestions.length} questions (requested ${fetchAmount})`);
    
    // If API returned fewer questions than requested, and we need more, try to fetch additional questions
    // This can happen if a category has limited questions
    if (apiQuestions.length < fetchAmount && apiQuestions.length < count) {
      console.log(`⚠️ API returned fewer questions than requested. Attempting to fetch more...`);
      const remainingNeeded = count - apiQuestions.length;
      const additionalFetch = Math.min(remainingNeeded + 5, 50 - apiQuestions.length);
      
      if (additionalFetch > 0) {
        try {
          const additionalQuestions = await fetchQuestionsFromAPI(additionalFetch, categoryParam, difficulty);
          if (additionalQuestions && additionalQuestions.length > 0) {
            // Filter out duplicates by question text
            const existingQuestionTexts = new Set(apiQuestions.map(q => q.question));
            const uniqueAdditional = additionalQuestions.filter(q => !existingQuestionTexts.has(q.question));
            apiQuestions = [...apiQuestions, ...uniqueAdditional];
            console.log(`Fetched ${uniqueAdditional.length} additional questions. Total: ${apiQuestions.length}`);
          }
        } catch (error) {
          console.log(`Could not fetch additional questions: ${error.message}`);
        }
      }
    }
    
    // Transform questions
    const transformedQuestions = apiQuestions.map((q, idx) => transformQuestion(q, idx));
    
    // Filter out questions that have been used (by question ID)
    const availableQuestions = transformedQuestions.filter(q => {
      return !usedQuestionIds.includes(q._questionId);
    });
    
    console.log(`After filtering used questions: ${availableQuestions.length} available (${usedQuestionIds.length} were used)`);
    
    // If we don't have enough questions, we need to fetch more or return what we have
    if (availableQuestions.length < count) {
      console.log(`⚠️ Warning: Only ${availableQuestions.length} unique questions available (requested ${count})`);
      
      // If we got fewer questions than requested from the API, it might be a category limitation
      // In this case, return what we have (the API doesn't have enough questions in this category)
      if (apiQuestions.length < fetchAmount) {
        console.log(`API only returned ${apiQuestions.length} questions (requested ${fetchAmount}). Category may have limited questions.`);
        const result = availableQuestions.slice(0, availableQuestions.length);
        console.log(`Returning ${result.length} questions (all available in category)`);
        return result;
      }
      
      // If we have some available but less than requested, return what we have
      if (availableQuestions.length > 0) {
        const result = availableQuestions.slice(0, availableQuestions.length);
        console.log(`Returning ${result.length} unique questions (requested ${count}, but some were filtered as used)`);
        return result;
      }
      
      // If all questions were used, return fresh ones anyway
      console.log('All questions were previously used. Returning new questions anyway.');
      const result = transformedQuestions.slice(0, Math.min(count, transformedQuestions.length));
      console.log(`Returning ${result.length} questions from fresh fetch`);
      return result;
    }
    
    // We have enough questions - shuffle and return exactly the requested count
    const shuffled = shuffleArray(availableQuestions);
    const result = shuffled.slice(0, count);
    console.log(`✓ Returning ${result.length} questions (requested ${count})`);
    return result;
    
  } catch (error) {
    console.error('Error fetching questions from Trivia API:', error);
    throw error;
  }
}

/**
 * Get random questions from Trivia API
 * @param {number} count - Number of questions
 * @param {string|number} category - Category ID (optional)
 * @param {string} difficulty - Difficulty level (optional)
 * @returns {Promise<Array>} Array of questions
 */
async function getRandomQuestions(count = 10, category = '', difficulty = '') {
  try {
    const apiQuestions = await fetchQuestionsFromAPI(count, category, difficulty);
    return apiQuestions.map((q, idx) => transformQuestion(q, idx));
  } catch (error) {
    console.error('Error fetching random questions:', error);
    throw error;
  }
}

/**
 * Get all available categories from Trivia API
 * @returns {Promise<Array>} Array of categories
 */
async function getCategories() {
  return new Promise((resolve, reject) => {
    https.get('https://opentdb.com/api_category.php', (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.trivia_categories) {
            resolve(response.trivia_categories);
          } else {
            reject(new Error('Invalid response from categories API'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse categories response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Network error fetching categories: ${error.message}`));
    });
  });
}

// Legacy functions for backward compatibility (now async)
async function getAllQuestions() {
  // This function doesn't make sense with API, but keeping for compatibility
  // Return empty array or fetch some default questions
  return getRandomQuestions(10);
}

async function loadQuestions() {
  // This function doesn't make sense with API, but keeping for compatibility
  return getRandomQuestions(10);
}

async function getQuestionByIndex(index) {
  // This function doesn't make sense with API, but keeping for compatibility
  const questions = await getRandomQuestions(1);
  return questions[0] || null;
}

async function getTotalQuestions() {
  // API doesn't provide total count, return a large number
  return 1000;
}

module.exports = {
  fetchQuestionsFromAPI,
  getQuestionsExcludingUsed,
  getRandomQuestions,
  getCategories,
  transformQuestion,
  // Legacy exports for backward compatibility
  getAllQuestions,
  loadQuestions,
  getQuestionByIndex,
  getTotalQuestions
};
