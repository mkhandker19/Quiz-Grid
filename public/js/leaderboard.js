async function loadLeaderboard() {
    try {
        const authResponse = await fetch('/api/auth/status');
        const authData = await authResponse.json();
        
        if (!authData.success || !authData.authenticated) {
            window.location.href = '/login.html';
            return;
        }

        const leaderboardResponse = await fetch('/api/leaderboard');
        const leaderboardData = await leaderboardResponse.json();

        if (!leaderboardData.success) {
            alert('Failed to load leaderboard. Redirecting to home...');
            window.location.href = '/index.html';
            return;
        }

        displayLeaderboard(leaderboardData);
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        alert('Failed to load leaderboard. Redirecting to home...');
        window.location.href = '/index.html';
    }
}

function displayLeaderboard(data) {
    const tableBody = document.getElementById('leaderboardTableBody');
    tableBody.innerHTML = '';

    if (data.leaderboard && data.leaderboard.length > 0) {
        data.leaderboard.forEach((player, index) => {
            const row = document.createElement('tr');
            
            if (data.currentUser && player.username === data.currentUser.username) {
                row.classList.add('current-user');
            }

            const rankCell = document.createElement('td');
            rankCell.className = 'rank-cell';
            const rank = index + 1;
            if (rank === 1) {
                rankCell.classList.add('rank-1');
                rankCell.textContent = '🥇';
            } else if (rank === 2) {
                rankCell.classList.add('rank-2');
                rankCell.textContent = '🥈';
            } else if (rank === 3) {
                rankCell.classList.add('rank-3');
                rankCell.textContent = '🥉';
            } else {
                rankCell.textContent = rank;
            }
            row.appendChild(rankCell);

            const usernameCell = document.createElement('td');
            usernameCell.className = 'username-cell';
            usernameCell.textContent = player.username;
            row.appendChild(usernameCell);

            const scoreCell = document.createElement('td');
            scoreCell.className = 'score-cell';
            if (player.bestScore >= 80) {
                scoreCell.classList.add('excellent');
            } else if (player.bestScore >= 60) {
                scoreCell.classList.add('good');
            }
            scoreCell.textContent = player.bestScore !== null ? `${player.bestScore}%` : '-';
            row.appendChild(scoreCell);

            const attemptsCell = document.createElement('td');
            attemptsCell.className = 'attempts-cell';
            attemptsCell.textContent = player.totalAttempts;
            row.appendChild(attemptsCell);

            const avgScoreCell = document.createElement('td');
            avgScoreCell.className = 'avg-score-cell';
            avgScoreCell.textContent = player.averageScore !== null ? `${player.averageScore}%` : '-';
            row.appendChild(avgScoreCell);

            tableBody.appendChild(row);
        });
    } else {
        tableBody.innerHTML = '<tr><td colspan="5" class="no-data">No players yet. Be the first to take a quiz!</td></tr>';
    }

    if (data.currentUser) {
        const userRankSection = document.getElementById('userRankSection');
        userRankSection.style.display = 'block';
        
        document.getElementById('userRank').textContent = data.currentUser.rank ? `#${data.currentUser.rank}` : 'Not Ranked';
        document.getElementById('userBestScore').textContent = data.currentUser.bestScore !== null ? `${data.currentUser.bestScore}%` : '-';
        document.getElementById('userAttempts').textContent = data.currentUser.totalAttempts;
        document.getElementById('userAvgScore').textContent = data.currentUser.averageScore !== null ? `${data.currentUser.averageScore}%` : '-';
    }
}

document.getElementById('homeBtn').addEventListener('click', () => {
    window.location.href = '/index.html';
});

document.getElementById('profileBtn').addEventListener('click', () => {
    window.location.href = '/profile.html';
});

loadLeaderboard();

