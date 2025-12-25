import { createRouter, createWebHistory } from 'vue-router'

// Lazy load views
const HomeView = () => import('@/views/HomeView.vue')
const BookView = () => import('@/views/BookView.vue')
const NoteView = () => import('@/views/NoteView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const NoteShareView = () => import('@/views/NoteShareView.vue')
const BookShareView = () => import('@/views/BookShareView.vue')
const TrashView = () => import('@/views/TrashView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')

const routes = [
    {
        path: '/',
        name: 'home',
        component: HomeView,
        meta: { requiresAuth: true }
    },
    {
        path: '/books',
        name: 'books',
        component: HomeView,
        meta: { requiresAuth: true }
    },
    {
        path: '/b/:id',
        name: 'book',
        component: BookView,
        meta: { requiresAuth: true }
    },
    {
        path: '/uncategorized',
        name: 'uncategorized',
        component: HomeView,
        meta: { requiresAuth: true }
    },
    {
        path: '/trash',
        name: 'trash',
        component: TrashView,
        meta: { requiresAuth: true }
    },
    {
        path: '/n/:id',
        name: 'note',
        component: NoteView
    },
    {
        path: '/login',
        name: 'login',
        component: LoginView
    },
    {
        path: '/s/:shareId',
        name: 'noteShare',
        component: NoteShareView
    },
    {
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

// Navigation guard
router.beforeEach(async (to, from, next) => {
    if (to.meta.requiresAuth) {
        try {
            const response = await fetch('/api/me')
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
