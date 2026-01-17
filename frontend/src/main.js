import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import router from './router'
import './assets/css/main.css'

// Import Font Awesome
import '@fortawesome/fontawesome-free/css/all.min.css'

// Import dayjs with plugins
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

// Make dayjs globally available
window.dayjs = dayjs

const app = createApp(App)

app.use(router)

app.mount('#app')
