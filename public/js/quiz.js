let currentQuestionIndex = 0;
let questions = [];
let userAnswers = {};
let totalQuestions = 0;

async function initQuiz() {
    try {
        const authResponse = await fetch('/api/auth/status');
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.authenticated) {
            window.location.href = '/login.html';
            return;
        }

        const quizResponse = await fetch('/api/quiz/start');
        const quizData = await quizResponse.json();

        if (!quizData.success) {
            alert('Failed to start quiz. Please try again.');
            window.location.href = '/index.html';
            return;
        }

        questions = quizData.questions;
        totalQuestions = quizData.totalQuestions;

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

initQuiz();

