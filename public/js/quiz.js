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

        // Ensure amount is between 1 and 10
        if (isNaN(quizConfig.amount) || quizConfig.amount < 1) quizConfig.amount = 1;
        if (quizConfig.amount > 10) quizConfig.amount = 10;

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

        // Check if fewer questions were returned than requested
        if (quizData.requestedAmount && quizData.totalQuestions < quizData.requestedAmount) {
            showQuestionLimitNotification(quizData.requestedAmount, quizData.totalQuestions);
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

// Function to show notification when fewer questions are available
function showQuestionLimitNotification(requested, available) {
    // Remove any existing notifications
    const existingNotification = document.getElementById('quiz-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'quiz-notification';
    notification.className = 'success-message';
    notification.textContent = `You requested ${requested} questions, but the database only has ${available} questions available.`;
    
    // Apply base styles before appending
    Object.assign(notification.style, {
        position: 'fixed',
        top: '80px',
        zIndex: '9999',
        minWidth: '300px',
        maxWidth: '90%',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        opacity: '0',
        transition: 'opacity 0.2s ease-in',
        visibility: 'hidden',
        display: 'block',
        left: '0px'
    });

    // Append to DOM while hidden
    document.body.appendChild(notification);
    
    // Force layout calculation
    void notification.offsetWidth;
    void notification.offsetHeight;
    
    // Calculate center position
    const width = notification.offsetWidth || 300;
    const leftPosition = Math.max(0, (window.innerWidth - width) / 2);
    notification.style.left = leftPosition + 'px';
    
    // Make visible
    notification.style.visibility = 'visible';
    void notification.offsetHeight;
    
    // Fade in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
    });

    // Auto-remove after 5 seconds (longer than logout notification since it's informational)
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
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

