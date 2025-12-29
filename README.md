# NoteHubMD

A modern, self-hosted Markdown note-taking platform with real-time collaboration.

![Screenshot](docs/images/screenshot.png)

## ✨ Features

![Features](docs/images/features.png)

- **📝 Markdown Editor** - Full-featured editor with live preview, syntax highlighting, and Mermaid diagram support
- **👥 Real-time Collaboration** - Multiple users can edit the same note simultaneously via Socket.IO
- **📚 Books & Notes** - Organize your notes into books with drag-and-drop reordering
- **🔐 Permission System** - Granular access control (private, public, login-required, per-user permissions)
- **🔗 Custom Share URLs** - Create memorable aliases for shared notes (e.g., `/s/my-tutorial`)
- **💬 Comments** - Enable discussions on notes with threaded comments
- **🏢 LDAP/AD Integration** - Enterprise-ready with Active Directory authentication
- **🐳 Docker Ready** - Easy deployment with Docker Compose
- **🗄️ Database Options** - PostgreSQL (recommended) or SQLite

## 🚀 Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/notehubmd.git
cd notehubmd
```

2. Start the services:
```bash
cd docker
docker-compose up -d
```

3. Access the application at `http://localhost:3000`

### Development

1. Install dependencies:
```bash
npm install
cd client && npm install
```

2. Start development servers:
```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend (Vite)
npm run client:dev
```
Access the application at `http://localhost:5173`.

3. Production Build:
```bash
npm run client:build
# Start server with Vite build
export USE_VITE_BUILD=true
npm start
```

### Configuration

Create a `.env` file in the project root to customize settings:

```bash
cp .env.example .env
```

## ⚙️ Environment Variables

| Variable                  | Description                                    | Default                         |
| ------------------------- | ---------------------------------------------- | ------------------------------- |
| `PORT`                    | Server port                                    | `3000`                          |
| `USE_VITE_BUILD`          | Serve Vite build from `public_dist`            | `false`                         |
| `SESSION_SECRET`          | Session encryption key (change in production!) | `your-secret-key-here`          |
| **Database**              |                                                |                                 |
| `DB_DIALECT`              | Database type (`postgres` or `sqlite`)         | `postgres`                      |
| `DB_HOST`                 | Database host                                  | `localhost`                     |
| `DB_PORT`                 | Database port                                  | `5432`                          |
| `DB_USERNAME`             | Database username                              | `postgres`                      |
| `DB_PASSWORD`             | Database password                              | -                               |
| `DB_NAME`                 | Database name                                  | `notehubmd`                     |
| `DB_STORAGE`              | SQLite file path (when using SQLite)           | `./database/database.sqlite`    |
| **Permissions**           |                                                |                                 |
| `DEFAULT_NOTE_PERMISSION` | Default permission for new notes               | `private`                       |
| `DEFAULT_BOOK_PERMISSION` | Default permission for new books               | `private`                       |
| **Features**              |                                                |                                 |
| `FEATURE_COMMENTS`        | Enable comments feature                        | `true`                          |
| `API_MASTER_KEY`          | Master API key for external access             | -                               |
| **LDAP (Optional)**       |                                                |                                 |
| `LDAP_ENABLED`            | Enable LDAP authentication                     | `false`                         |
| `LDAP_URL`                | LDAP server URL                                | -                               |
| `LDAP_BIND_DN`            | LDAP bind DN                                   | -                               |
| `LDAP_BIND_PASSWORD`      | LDAP bind password                             | -                               |
| `LDAP_SEARCH_BASE`        | LDAP user search base                          | -                               |
| `LDAP_SEARCH_FILTER`      | LDAP search filter                             | `(sAMAccountName={{username}})` |

## 📄 License

MIT License
