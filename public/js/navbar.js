// Navigation Bar Component
class NavigationBar {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.render();
        this.attachEventListeners();
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/status');
            
            if (response.status === 401) {
                // User is not authenticated
                this.user = null;
                return;
            }
            
            const data = await response.json();
            
            if (data.success && data.authenticated) {
                this.user = data.user;
            } else {
                this.user = null;
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.user = null;
        }
    }

    render() {
        const navContainer = document.getElementById('navbar-container');
        if (!navContainer) return;

        navContainer.innerHTML = `
            <nav class="navbar">
                <div class="navbar-brand">
                    <a href="/index.html">Quiz Grid</a>
                </div>
                <div class="navbar-menu">
                    ${this.user ? this.renderAuthenticatedMenu() : this.renderUnauthenticatedMenu()}
                </div>
            </nav>
        `;
    }

    renderAuthenticatedMenu() {
        return `
            <div class="navbar-links">
                <a href="/index.html" class="nav-link">Home</a>
                <a href="/quiz.html" class="nav-link">Quiz</a>
                <a href="/profile.html" class="nav-link">Profile</a>
                <a href="/leaderboard.html" class="nav-link">Leaderboard</a>
            </div>
            <div class="navbar-user">
                <span class="user-info">Welcome, <strong>${this.user.username}</strong></span>
                <button id="logoutBtn" class="btn-logout">Logout</button>
            </div>
        `;
    }

    renderUnauthenticatedMenu() {
        return `
            <div class="navbar-links">
                <a href="/login.html" class="nav-link">Login</a>
                <a href="/signup.html" class="nav-link">Sign Up</a>
            </div>
        `;
    }

    attachEventListeners() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    const response = await fetch('/api/logout', { method: 'POST' });
                    const result = await response.json();
                    if (result.success) {
                        window.location.href = '/login.html';
                    } else {
                        console.error('Logout failed:', result.message);
                        window.location.href = '/login.html';
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    window.location.href = '/login.html';
                }
            });
        }
    }

    getUser() {
        return this.user;
    }
}

// Initialize navbar when DOM is ready
let navbar;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        navbar = new NavigationBar();
    });
} else {
    navbar = new NavigationBar();
}

