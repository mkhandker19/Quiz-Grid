async function loadProfile() {
    try {
        const authResponse = await fetch('/api/auth/status', {
            credentials: 'include'
        });
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.authenticated) {
            window.location.href = '/login.html';
            return;
        }

        const profileResponse = await fetch('/api/user/profile', {
            credentials: 'include'
        });
        const profileData = await profileResponse.json();

        if (!profileData.success) {
            alert('Failed to load profile. Redirecting to home...');
            window.location.href = '/index.html';
            return;
        }

        displayProfile(profileData);
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Failed to load profile. Redirecting to home...');
        window.location.href = '/index.html';
    }
}

function displayProfile(data) {
    document.getElementById('username').textContent = data.user.username;
    document.getElementById('email').textContent = data.user.email;
    
    document.getElementById('totalAttempts').textContent = data.stats.totalQuizzes;
    
    const bestScore = data.stats.bestScore;
    document.getElementById('bestScore').textContent = bestScore !== null ? `${bestScore}%` : '-';
    
    const avgScore = data.stats.averageScore;
    document.getElementById('averageScore').textContent = avgScore !== null ? `${avgScore}%` : '-';

    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (data.history && data.history.length > 0) {
        data.history.forEach((attempt) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';

            const historyHeader = document.createElement('div');
            historyHeader.className = 'history-header';

            const dateDiv = document.createElement('div');
            dateDiv.className = 'history-date';
            const date = new Date(attempt.date);
            dateDiv.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            historyHeader.appendChild(dateDiv);

            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'history-score';
            
            let scoreClass = 'poor';
            if (attempt.score >= 80) {
                scoreClass = 'excellent';
            } else if (attempt.score >= 60) {
                scoreClass = 'good';
            }
            
            scoreDiv.classList.add(scoreClass);
            scoreDiv.textContent = `${attempt.score}%`;
            historyHeader.appendChild(scoreDiv);

            historyItem.appendChild(historyHeader);

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'history-details';

            const correctDiv = document.createElement('div');
            correctDiv.className = 'history-detail-item';
            correctDiv.innerHTML = `<span>✓</span> <span>${attempt.correctCount}/${attempt.totalQuestions} correct</span>`;
            detailsDiv.appendChild(correctDiv);

            if (attempt.timeTaken) {
                const timeDiv = document.createElement('div');
                timeDiv.className = 'history-detail-item';
                const minutes = Math.floor(attempt.timeTaken / 60);
                const seconds = attempt.timeTaken % 60;
                timeDiv.textContent = `⏱ ${minutes}m ${seconds}s`;
                detailsDiv.appendChild(timeDiv);
            }

            historyItem.appendChild(detailsDiv);
            historyList.appendChild(historyItem);
        });
    } else {
        historyList.innerHTML = '<div class="no-history">No quiz attempts yet. Start your first quiz!</div>';
    }
}

document.getElementById('homeBtn').addEventListener('click', () => {
    window.location.href = '/index.html';
});

loadProfile();

