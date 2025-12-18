/**
 * NoteHubMD Login Page Script
 * Handles login/register functionality
 */

// Use IIFE to avoid polluting global scope
(function () {
    // Get dependencies from common.js
    const { createApp, ref, onMounted, nextTick, reactive } = window.NoteHubMD.Vue;
    const { createRouter, createWebHistory, useRoute } = window.NoteHubMD.VueRouter;
    const { api, setAppInstance } = window.NoteHubMD;

    // Login Component
    const Login = {
        template: '#login-template',
        setup() {
            const route = useRoute();
            const isRegister = ref(false);
            const username = ref('');
            const password = ref('');
            const error = ref('');
            const usernameInput = ref(null);

            onMounted(() => {
                usernameInput.value?.focus();
            });

            const toggleMode = () => {
                isRegister.value = !isRegister.value;
                error.value = '';
                nextTick(() => {
                    usernameInput.value?.focus();
                });
            };

            const handleSubmit = async () => {
                error.value = '';
                try {
                    if (isRegister.value) {
                        await api.register(username.value, password.value);
                    } else {
                        await api.login(username.value, password.value);
                    }
                    // Redirect to original page if available, otherwise home
                    const redirectTo = route.query.redirect || '/';
                    window.location.href = redirectTo;
                } catch (e) {
                    error.value = e.message;
                }
            };

            return { isRegister, username, password, error, toggleMode, handleSubmit, usernameInput };
        }
    };

    // Routes
    const routes = [
        { path: '/', component: Login },
        { path: '/login', component: Login }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    // Create Vue App
    const app = createApp({
        setup() {
            // Modal state
            const modal = reactive({
                show: false,
                type: 'alert',
                title: '',
                message: '',
                confirmText: '',
                cancelText: '',
                resolve: null
            });

            const showAlert = (message, options = {}) => {
                return new Promise(resolve => {
                    modal.show = true;
                    modal.type = options.type || 'alert';
                    modal.title = options.title || '';
                    modal.message = message;
                    modal.confirmText = options.confirmText || '確定';
                    modal.cancelText = options.cancelText || '取消';
                    modal.resolve = resolve;
                });
            };

            const showConfirm = (message, options = {}) => {
                return new Promise(resolve => {
                    modal.show = true;
                    modal.type = 'confirm';
                    modal.title = options.title || '';
                    modal.message = message;
                    modal.confirmText = options.confirmText || '確定';
                    modal.cancelText = options.cancelText || '取消';
                    modal.resolve = resolve;
                });
            };

            const closeModal = (result = true) => {
                modal.show = false;
                if (modal.resolve) {
                    modal.resolve(result);
                    modal.resolve = null;
                }
            };

            return {
                modal,
                showAlert,
                showConfirm,
                closeModal
            };
        }
    });

    app.use(router);

    // Mount app and get the instance
    const vm = app.mount('#app');

    // Set app instance for global modal
    setAppInstance(vm);

    // Apply theme
    const theme = localStorage.getItem('NoteHubMD-theme') || 'dark';
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
})();
