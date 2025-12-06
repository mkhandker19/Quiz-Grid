async function loadResults() {
    try {
        const authResponse = await fetch('/api/auth/status', {
            credentials: 'include'
        });
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.authenticated) {
            window.location.href = '/login.html';
            return;
        }

        const resultsResponse = await fetch('/api/quiz/results', {
            credentials: 'include'
        });
        const resultsData = await resultsResponse.json();

        if (!resultsData.success) {
            alert('No quiz results found. Redirecting to home...');
            window.location.href = '/index.html';
            return;
        }

        displayResults(resultsData);
    } catch (error) {
        console.error('Error loading results:', error);
        alert('Failed to load results. Redirecting to home...');
        window.location.href = '/index.html';
    }
}

function displayResults(data) {
    document.getElementById('scorePercentage').textContent = `${data.score}%`;
    document.getElementById('scoreNumber').textContent = `${data.correctCount}/${data.totalQuestions}`;
    document.getElementById('correctCount').textContent = data.correctCount;
    document.getElementById('incorrectCount').textContent = data.incorrectCount;
    document.getElementById('totalCount').textContent = data.totalQuestions;

    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';

    data.results.forEach((result) => {
        const resultItem = document.createElement('div');
        resultItem.className = `result-item ${result.isCorrect ? 'correct' : 'incorrect'}`;

        const questionDiv = document.createElement('div');
        questionDiv.className = 'result-question';
        questionDiv.textContent = `${result.questionNumber}. ${result.question}`;
        resultItem.appendChild(questionDiv);

        const optionsDiv = document.createElement('div');
        optionsDiv.className = 'result-options';

        const optionKeys = ['A', 'B', 'C', 'D'];
        optionKeys.forEach((key) => {
            if (result.options[key]) {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'result-option';

                const isUserAnswer = result.userAnswer === key;
                const isCorrectAnswer = result.correctAnswer === key;

                if (isUserAnswer && isCorrectAnswer) {
                    optionDiv.classList.add('user-answer', 'correct-answer');
                } else if (isUserAnswer) {
                    optionDiv.classList.add('user-answer');
                } else if (isCorrectAnswer) {
                    optionDiv.classList.add('correct-answer');
                }

                const labelSpan = document.createElement('span');
                labelSpan.className = 'result-answer-label';
                labelSpan.textContent = `${key}: `;
                optionDiv.appendChild(labelSpan);

                const textSpan = document.createElement('span');
                textSpan.textContent = result.options[key];
                optionDiv.appendChild(textSpan);

                optionsDiv.appendChild(optionDiv);
            }
        });

        resultItem.appendChild(optionsDiv);

        const statusDiv = document.createElement('div');
        statusDiv.className = `result-status ${result.isCorrect ? 'correct' : 'incorrect'}`;
        if (result.isCorrect) {
            statusDiv.textContent = '✓ Correct';
        } else {
            statusDiv.textContent = `✗ Incorrect (Correct answer: ${result.correctAnswer})`;
        }
        resultItem.appendChild(statusDiv);

        resultsList.appendChild(resultItem);
    });
}

document.getElementById('homeBtn').addEventListener('click', () => {
    window.location.href = '/index.html';
});

document.getElementById('retakeBtn').addEventListener('click', () => {
    window.location.href = '/quiz.html';
});

loadResults();

