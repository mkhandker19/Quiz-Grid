// Navigation Bar Component
class NavigationBar {
    constructor() {
        this.user = null;
        this.logoutHandlerAttached = false;
        this.init();
    }

    async init() {
        // Attach logout handler once using event delegation (works even after re-renders)
        if (!this.logoutHandlerAttached) {
            this.attachLogoutHandler();
            this.logoutHandlerAttached = true;
        }
        
        // Render immediately with unauthenticated state to avoid delay
        this.render();
        // Then check auth and update if needed
        await this.checkAuth();
        this.render(); // Re-render with correct auth state
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/status', {
                credentials: 'include'
            });
            
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
                    <img src="/logo.png" alt="Quiz Grid Logo" class="navbar-logo" />
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
                <a href="/index.html" class="nav-link">Quiz</a>
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

    attachLogoutHandler() {
        // Store reference to this for use in event handler
        const self = this;
        
        // Use event delegation on document to handle logout button clicks
        // This works even if the button is recreated during re-renders
        document.addEventListener('click', async function(e) {
            // Check if the clicked element is the logout button
            if (e.target && (e.target.id === 'logoutBtn' || e.target.closest('#logoutBtn'))) {
                const logoutBtn = e.target.id === 'logoutBtn' ? e.target : e.target.closest('#logoutBtn');
                
                e.preventDefault();
                e.stopPropagation();
                
                // IMPORTANT: Disable quiz protection before logout to prevent "Leave site?" dialog
                // This removes the beforeunload listener that triggers the browser warning
                if (typeof window.disableBackButtonProtection === 'function') {
                    window.disableBackButtonProtection();
                }
                
                // Disable button to prevent multiple clicks
                const originalText = logoutBtn.textContent;
                logoutBtn.disabled = true;
                logoutBtn.textContent = 'Logging out...';
                
                try {
                    const response = await fetch('/api/logout', { 
                        method: 'POST',
                        credentials: 'include'
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const result = await response.json();
                    if (result.success) {
                        // Show success notification
                        self.showNotification('Logged out successfully!', 'success');
                        // Clear any cached user data
                        self.user = null;
                        // Redirect after a short delay to show notification
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 1500);
                    } else {
                        console.error('Logout failed:', result.message);
                        // Still redirect to login even if logout response indicates failure
                        self.user = null;
                        window.location.href = '/login.html';
                    }
                } catch (error) {
                    console.error('Logout error:', error);
                    // Clear user data and redirect even on error
                    self.user = null;
                    window.location.href = '/login.html';
                } finally {
                    // Re-enable button in case redirect doesn't happen immediately
                    logoutBtn.disabled = false;
                    logoutBtn.textContent = originalText;
                }
            }
        });
    }

    getUser() {
        return this.user;
    }

    showNotification(message, type = 'success') {
        // Remove any existing notifications
        const existingNotification = document.getElementById('navbar-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification element with all styles applied before appending
        const notification = document.createElement('div');
        notification.id = 'navbar-notification';
        notification.className = type === 'success' ? 'success-message' : 'error-message';
        notification.textContent = message;
        
        // Apply base styles before appending (completely hidden)
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
            left: '0px' // Temporary, will be recalculated
        });

        // Append to DOM while hidden
        document.body.appendChild(notification);
        
        // Force layout calculation while still hidden
        void notification.offsetWidth;
        void notification.offsetHeight;
        
        // Get the actual width
        const width = notification.offsetWidth || 300;
        
        // Calculate exact center position BEFORE making visible
        const leftPosition = Math.max(0, (window.innerWidth - width) / 2);
        notification.style.left = leftPosition + 'px';
        
        // Now make it visible - position is already set correctly
        notification.style.visibility = 'visible';
        
        // Force one more reflow to ensure position is applied
        void notification.offsetHeight;
        
        // Fade in smoothly
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
        });

        // Auto-remove after 3 seconds
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
        }, 3000);
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

