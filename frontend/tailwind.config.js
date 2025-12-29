export default {
    content: ['./index.html', './src/**/*.{vue,js,ts}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                dark: {
                    bg: '#1a1a1a',
                    surface: '#2d2d2d',
                    text: '#e0e0e0'
                }
            }
        }
    },
    plugins: []
}
