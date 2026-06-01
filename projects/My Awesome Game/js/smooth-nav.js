/**
 * Smooth Navigation Helper
 * Adds fade transitions to page navigation
 */

(function() {
    'use strict';

    // Add smooth navigation to links
    function initSmoothNavigation() {
        // Get all navigation links
        const links = document.querySelectorAll('a[href], button[onclick*="location"]');
        
        links.forEach(link => {
            const href = link.getAttribute('href');
            const onclick = link.getAttribute('onclick');
            
            // Skip external links and hash links
            if (href && (href.startsWith('http') || href.startsWith('#'))) {
                return;
            }
            
            // Skip if already processed
            if (link.classList.contains('smooth-nav-processed')) {
                return;
            }
            
            link.classList.add('smooth-nav-processed');
            
            // Add click handler
            link.addEventListener('click', function(e) {
                if (href && !href.startsWith('#')) {
                    e.preventDefault();
                    navigateWithTransition(href);
                }
            });
        });
    }

    // Navigate with fade transition
    function navigateWithTransition(url) {
        document.body.classList.add('page-exit');
        
        setTimeout(() => {
            window.location.href = url;
        }, 300);
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSmoothNavigation);
    } else {
        initSmoothNavigation();
    }

    // Re-initialize on dynamic content changes
    const observer = new MutationObserver((mutations) => {
        let shouldReinit = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldReinit = true;
            }
        });
        if (shouldReinit) {
            initSmoothNavigation();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Export for manual use
    window.smoothNavigate = navigateWithTransition;

    // Error notification system (replaces alerts)
    window.showNotification = function(message, type = 'info', duration = 3000) {
        // Remove existing notifications
        const existing = document.querySelectorAll('.redglitch-notification');
        existing.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'redglitch-notification notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#2ecc71' : '#3498db'};
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-family: 'VT323', monospace;
            font-size: 18px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            word-wrap: break-word;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    };

    // Enhanced error handler (replaces alert)
    window.showError = function(message) {
        window.showNotification(message, 'error', 4000);
    };

    window.showSuccess = function(message) {
        window.showNotification(message, 'success', 3000);
    };

    window.showInfo = function(message) {
        window.showNotification(message, 'info', 3000);
    };
})();
