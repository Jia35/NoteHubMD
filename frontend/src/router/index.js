import { createRouter, createWebHistory } from 'vue-router'

// Lazy load views
const HomeView = () => import('@/views/HomeView.vue')
const BookView = () => import('@/views/BookView.vue')
const NoteRouter = () => import('@/views/NoteRouter.vue')
const LoginView = () => import('@/views/LoginView.vue')
const NoteShareView = () => import('@/views/NoteShareView.vue')
const BookShareView = () => import('@/views/BookShareView.vue')
const TrashView = () => import('@/views/TrashView.vue')
const AdminView = () => import('@/views/AdminView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')

const routes = [
    {
        path: '/',
        name: 'home',
        component: HomeView,
        meta: { requiresAuth: true, showSidebar: true }
    },
    {
        path: '/books',
        name: 'books',
        component: HomeView,
        meta: { requiresAuth: true, showSidebar: true }
    },
    {
        path: '/b/:id',
        name: 'book',
        component: BookView,
        // No requiresAuth - API handles permission; public-view/public-edit books don't require login
        meta: { showSidebar: true }
    },
    {
        path: '/uncategorized',
        name: 'uncategorized',
        component: HomeView,
        meta: { requiresAuth: true, showSidebar: true }
    },
    {
        path: '/trash',
        name: 'trash',
        component: TrashView,
        meta: { requiresAuth: true, showSidebar: true }
    },
    {
        path: '/admin',
        name: 'admin',
        component: AdminView,
        meta: { requiresAuth: true, showSidebar: true }
    },
    {
        path: '/n/:id',
        name: 'note',
        component: NoteRouter  // Smart router that determines note type
    },
    {
        path: '/login',
        name: 'login',
        component: LoginView
    },
    {
        // Share pages are public (no auth required)
        path: '/s/:shareId',
        name: 'noteShare',
        component: NoteShareView
    },
    {
        // Share pages are public (no auth required)
        path: '/v/:shareId',
        name: 'bookShare',
        component: BookShareView
    },
    {
        path: '/404',
        name: 'notFound',
        component: NotFoundView
    },
    {
        path: '/:pathMatch(.*)*',
        redirect: '/404'
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

// Navigation guard - redirect to login if not authenticated
router.beforeEach(async (to, from, next) => {
    if (to.meta.requiresAuth) {
        try {
            const response = await fetch('/api/auth/me')
            if (!response.ok) {
                return next({ path: '/login', query: { redirect: to.fullPath } })
            }
        } catch (e) {
            return next({ path: '/login', query: { redirect: to.fullPath } })
        }
    }
    next()
})

export default router

