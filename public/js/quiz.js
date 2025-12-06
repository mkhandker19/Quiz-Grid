let currentQuestionIndex = 0;
let questions = [];
let userAnswers = {};
let totalQuestions = 0;

// Check authentication immediately when script loads - before any other operations
(async function checkAuthFirst() {
    try {
        const authResponse = await fetch('/api/auth/status', {
            credentials: 'include'
        });
        
        if (authResponse.status === 401) {
            // Not authenticated - redirect immediately before any quiz loading
            window.location.href = '/login.html';
            return;
        }
        
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.authenticated) {
            // Not authenticated - redirect immediately before any quiz loading
            window.location.href = '/login.html';
            return;
        }
        
        // Only proceed with quiz initialization if authenticated
        initQuiz();
    } catch (error) {
        console.error('Auth check error:', error);
        // On error, redirect to login to be safe
        window.location.href = '/login.html';
    }
})();

async function initQuiz() {
    try {
        // Get quiz configuration from URL parameters (preferred) or sessionStorage (fallback)
        const urlParams = new URLSearchParams(window.location.search);
        let quizConfig = {
            amount: 10,
            category: ''
        };

        // First, try to get from URL parameters
        const urlAmount = urlParams.get('amount');
        const urlCategory = urlParams.get('category');
        
        if (urlAmount || urlCategory) {
            console.log('Found config in URL parameters:', { amount: urlAmount, category: urlCategory });
            quizConfig.amount = urlAmount ? parseInt(urlAmount) : 10;
            quizConfig.category = urlCategory || '';
        } else {
            // Fallback to sessionStorage
            const quizConfigStr = sessionStorage.getItem('quizConfig');
            if (quizConfigStr) {
                try {
                    const storedConfig = JSON.parse(quizConfigStr);
                    console.log('Loaded quiz config from sessionStorage:', storedConfig);
                    quizConfig.amount = storedConfig.amount || 10;
                    quizConfig.category = storedConfig.category || '';
                } catch (e) {
                    console.warn('Failed to parse quiz config, using defaults:', e);
                }
            } else {
                console.log('No quiz config found, using defaults');
            }
        }

        // Ensure amount is between 10 and 20
        if (isNaN(quizConfig.amount) || quizConfig.amount < 10) quizConfig.amount = 10;
        if (quizConfig.amount > 20) quizConfig.amount = 20;

        // Build query parameters - always include amount, include category if provided
        const params = new URLSearchParams();
        params.set('amount', quizConfig.amount.toString());
        if (quizConfig.category && quizConfig.category !== '' && quizConfig.category !== 'undefined') {
            params.set('category', quizConfig.category);
        }

        const queryString = params.toString();
        const apiUrl = '/api/quiz/start?' + queryString;
        
        console.log('=== CLIENT: Making API Request ===');
        console.log('Final quiz config being sent:', quizConfig);
        console.log('Query string:', queryString);
        console.log('Full API URL:', apiUrl);
        console.log('===============================');

        const quizResponse = await fetch(apiUrl, {
            credentials: 'include'
        });
        const quizData = await quizResponse.json();

        console.log('=== CLIENT: Received API Response ===');
        console.log('Response success:', quizData.success);
        console.log('Number of questions received:', quizData.questions ? quizData.questions.length : 0);
        console.log('Total questions reported:', quizData.totalQuestions);
        console.log('Expected amount:', quizConfig.amount);
        if (quizData.questions && quizData.questions.length > 0) {
            console.log('First question:', quizData.questions[0].question.substring(0, 50) + '...');
        }
        console.log('====================================');

        if (!quizData.success) {
            // Show user-friendly error message
            const errorMessage = quizData.message || 'Failed to start quiz. Please try again.';
            alert(errorMessage);
            window.location.href = '/index.html';
            return;
        }

        questions = quizData.questions;
        totalQuestions = quizData.totalQuestions;
        
        console.log('Questions array length:', questions.length);
        console.log('totalQuestions variable:', totalQuestions);

        if (questions.length === 0) {
            alert('No questions available. Redirecting to home...');
            window.location.href = '/index.html';
            return;
        }

        displayQuestion();
        updateProgress();
    } catch (error) {
        console.error('Error initializing quiz:', error);
        alert('Failed to load quiz. Redirecting to home...');
        window.location.href = '/index.html';
    }
}

function displayQuestion() {
    const question = questions[currentQuestionIndex];
    
    document.getElementById('questionNumber').textContent = 
        `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    
    document.getElementById('questionText').textContent = question.question;
    
    const answerOptions = document.getElementById('answerOptions');
    answerOptions.innerHTML = '';
    
    const optionKeys = ['A', 'B', 'C', 'D'];
    optionKeys.forEach((key, index) => {
        if (question.options[key]) {
            const optionElement = document.createElement('div');
            optionElement.className = 'answer-option';
            if (userAnswers[currentQuestionIndex] === key) {
                optionElement.classList.add('selected');
            }
            optionElement.textContent = `${key}: ${question.options[key]}`;
            optionElement.addEventListener('click', () => selectAnswer(key));
            answerOptions.appendChild(optionElement);
        }
    });
    
    updateNavigationButtons();
    updateProgress();
}

async function selectAnswer(answerKey) {
    userAnswers[currentQuestionIndex] = answerKey;
    
    const options = document.querySelectorAll('.answer-option');
    options.forEach((option) => {
        const optionText = option.textContent;
        if (optionText.startsWith(answerKey + ':')) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
    
    try {
        const response = await fetch('/api/quiz/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                questionIndex: currentQuestionIndex,
                answer: answerKey
            })
        });

        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to save answer:', data.message);
        }
    } catch (error) {
        console.error('Error saving answer:', error);
    }
    
    updateNavigationButtons();
    updateProgress();
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    
    prevBtn.disabled = currentQuestionIndex === 0;
    
    if (currentQuestionIndex === totalQuestions - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
        submitBtn.disabled = userAnswers[currentQuestionIndex] === undefined;
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
        nextBtn.disabled = userAnswers[currentQuestionIndex] === undefined;
    }
}

function updateProgress() {
    const answeredCount = Object.keys(userAnswers).length;
    const progressPercentage = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = `${progressPercentage}%`;
    }
    
    const progressText = document.getElementById('progressText');
    if (progressText) {
        progressText.textContent = `Progress: ${answeredCount}/${totalQuestions} answered`;
    }
}

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        displayQuestion();
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentQuestionIndex < totalQuestions - 1) {
        currentQuestionIndex++;
        displayQuestion();
    }
});

document.getElementById('submitBtn').addEventListener('click', async () => {
    try {
        const unanswered = questions.findIndex((q, index) => userAnswers[index] === undefined);
        if (unanswered !== -1) {
            alert('Please answer all questions before submitting.');
            return;
        }

        const response = await fetch('/api/quiz/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                answers: userAnswers
            })
        });

        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/results.html';
        } else {
            alert('Failed to submit quiz. Please try again.');
        }
    } catch (error) {
        console.error('Error submitting quiz:', error);
        alert('An error occurred while submitting the quiz. Please try again.');
    }
});

