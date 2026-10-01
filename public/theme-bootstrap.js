(function () {
    try {
        // Key must match STORAGE_KEYS.THEME_MODE in js/constants.js
        const themeMode = localStorage.getItem('themeMode') || 'auto';
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = themeMode === 'dark' || (themeMode === 'auto' && prefersDark);

        document.documentElement.classList.toggle('dark-theme', isDark);
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

        // Key and values must match STORAGE_KEYS.THEME_PALETTE and
        // THEME_PALETTES in js/constants.js
        const palettes = ['coastal', 'organic', 'industry', 'broadsheet'];
        const storedPalette = localStorage.getItem('themePalette');
        document.documentElement.setAttribute(
            'data-palette',
            palettes.indexOf(storedPalette) >= 0 ? storedPalette : 'coastal'
        );
    } catch {
        // If storage access fails, keep auto behavior from CSS/JS defaults.
    }
})();
