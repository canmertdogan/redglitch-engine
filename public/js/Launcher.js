/**
 * Ketebe Engine - Launcher UI Logic
 * Manages login, main menu, and initial transitions
 */
(function() {
    'use strict';

    // UI Helper for quitting
    window.quitGame = function() {
        if (typeof window !== 'undefined' && window.process && window.process.type) {
            // Electron environment
            try {
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('window-close');
            } catch (e) {
                window.close();
            }
        } else {
            // Web environment - go back or close
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.close();
            }
        }
    };

    // Show main menu after login
    window.attemptLogin = function() {
        const input = document.getElementById('username-input');
        if (!input) return;
        
        const username = input.value.trim();
        if (!username) {
            if (window.showNotification) window.showNotification('Please enter a username', 'error');
            else alert('Please enter a username');
            return;
        }

        // Store username
        localStorage.setItem('ketebe_username', username);
        const display = document.getElementById('current-user-display');
        if (display) display.textContent = username;

        // Hide login, show main menu
        const loginScreen = document.getElementById('login-screen');
        const mainMenu = document.getElementById('main-menu');
        
        if (loginScreen) {
            loginScreen.classList.remove('active');
            loginScreen.classList.add('hidden');
        }
        
        if (mainMenu) {
            mainMenu.classList.remove('hidden');
            mainMenu.classList.add('active');
        }

        // Play intro sound if available
        if (window.KetebeEventBus) {
            window.KetebeEventBus.emit('ui:login', { username });
        }
    };

    // Auto-login and initialization
    window.addEventListener('load', () => {
        const input = document.getElementById('username-input');
        const display = document.getElementById('current-user-display');
        
        const savedUsername = localStorage.getItem('ketebe_username');
        if (savedUsername) {
            if (input) input.value = savedUsername;
            if (display) display.textContent = savedUsername;
        }

        // Allow Enter key on username input
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    window.attemptLogin();
                }
            });
        }

        // --- SPLASH SCREEN AUTO-HIDE ---
        // This is now handled by the BlackholeBackground onComplete callback
        // or by runtime-loader for static builds.
    });

})();