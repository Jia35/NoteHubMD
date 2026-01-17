# NoteHubMD

[English](README-EN.md)

現代化、可自架的 Markdown 筆記平台，支援即時協作。

![Screenshot](docs/images/screenshot.png)

## ✨ 功能亮點

![Features](docs/images/features-tw.jpg)

- **📝 Markdown 編輯器** - 完整功能的編輯器，支援即時預覽、語法高亮、Mermaid 流程圖
- **🎨 白板筆記** - 基於 Excalidraw 的白板功能，透過 Yjs CRDT 實現多人即時協作
- **📊 流程圖筆記** - 整合 Draw.io 的流程圖編輯功能，支援即時協作
- **👥 即時協作** - 透過 Socket.IO 實現多人同時編輯同一份筆記
- **📚 書本與筆記** - 使用書本分類筆記，支援拖曳排序。支援列表/網格檢視模式
- **🔐 權限系統** - 細緻的存取控制（私人、公開、需登入、個別使用者權限）
- **🔗 自訂分享網址** - 為分享的筆記與書本建立容易記憶的別名（例如 `/s/my-tutorial`）
- **💬 留言功能** - 在筆記上啟用討論與留言，支援表情符號回饋
- **😊 表情符號回饋** - 對筆記與留言進行表情符號回應
- **🔄 版本紀錄** - 筆記版本控制，支援差異比對與版本還原功能
- **🤖 AI 助理** - 整合 AI 聊天功能，支援 OpenAI 相容 API 及本地 Ollama
- **🔔 留言 Webhook** - 當有新留言時發送通知到外部服務
- **🏢 LDAP/AD 整合** - 支援 Active Directory 企業級驗證
- **🐳 Docker 部署** - 使用 Docker Compose 輕鬆部署
- **🗄️ 資料庫選項** - 支援 PostgreSQL（建議）或 SQLite

## 🚀 使用 Docker 快速開始

### 前置需求
- 已安裝 Docker 和 Docker Compose

### 安裝步驟

1. 複製專案：
```bash
git clone https://github.com/Jia35/notehubmd.git
cd notehubmd
```

2. 啟動服務：
```bash
docker-compose up -d
```

3. 開啟瀏覽器訪問 `http://localhost:3000`

### 開發指南

專案目前採用 Monorepo 架構，分為 `backend` (後端) 與 `frontend` (前端) 目錄。

1. 安裝依賴套件：
```bash
npm run install:all
```

2. 啟動開發伺服器：
```bash
# 終端機 1：後端 (Port 3000)
npm run dev:backend

# 終端機 2：前端 (Port 5173)
npm run dev:frontend
```
開發時請訪問 `http://localhost:5173`。

3. 生產環境建置：
```bash
# 建置前端
npm run build:frontend

# 啟動後端伺服器 (提供靜態檔案)
npm start
```

### 自訂設定

在專案根目錄建立 `.env` 檔案來自訂設定：

```bash
cp .env.example .env
```

## ⚙️ 環境變數

| 變數 | 說明 | 預設值 |
| --- | --- | --- |
| `PORT` | 伺服器埠號 | `3000` |
| `USE_VITE_BUILD` | 是否使用 `frontend/dist` 的 Vite 建置檔案 | `false` |
| `SESSION_SECRET` | Session 加密金鑰（正式環境請務必修改！） | `your-secret-key-here` |
| **資料庫** | | |
| `DB_DIALECT` | 資料庫類型（`postgres` 或 `sqlite`） | `postgres` |
| `DB_HOST` | 資料庫主機 | `localhost` |
| `DB_PORT` | 資料庫埠號 | `5432` |
| `DB_USERNAME` | 資料庫使用者名稱 | `postgres` |
| `DB_PASSWORD` | 資料庫密碼 | - |
| `DB_NAME` | 資料庫名稱 | `notehubmd` |
| `DB_STORAGE` | SQLite 檔案路徑（使用 SQLite 時） | `./database/database.sqlite` |
| **權限** | | |
| `DEFAULT_NOTE_PERMISSION` | 新筆記的預設權限 | `private` |
| `DEFAULT_BOOK_PERMISSION` | 新書本的預設權限 | `private` |
| **功能** | | |
| `FEATURE_COMMENTS` | 啟用留言功能 | `true` |
| `FEATURE_NOTE_REACTIONS` | 啟用筆記表情符號回饋 | `true` |
| `DRAWIO_URL` | Draw.io 實例 URL（公用或自架） | `https://embed.diagrams.net` |
| `API_MASTER_KEY` | 外部存取用的 Master API Key | - |
| **Webhook** | | |
| `COMMENT_WEBHOOK_URL` | 留言通知的 Webhook URL | - |
| **垃圾桶** | | |
| `TRASH_AUTO_DELETE_DAYS` | 自動刪除垃圾桶內容的天數（設為 0 停用） | `90` |
| **LDAP（選用）** | | |
| `LDAP_ENABLED` | 啟用 LDAP 驗證 | `false` |
| `LDAP_URL` | LDAP 伺服器 URL | - |
| `LDAP_BIND_DN` | LDAP Bind DN | - |
| `LDAP_BIND_PASSWORD` | LDAP Bind 密碼 | - |
| `LDAP_SEARCH_BASE` | LDAP 使用者搜尋 Base | - |
| `LDAP_SEARCH_FILTER` | LDAP 搜尋過濾器 | `(sAMAccountName={{username}})` |
| **Proxy（選用）** | | |
| `HTTP_PROXY` | HTTP 代理伺服器 URL | - |
| `HTTPS_PROXY` | HTTPS 代理伺服器 URL | - |
| `NO_PROXY` | 不使用代理的主機列表 | - |

## 🔔 留言 Webhook

當設定 `COMMENT_WEBHOOK_URL` 環境變數後，系統會在每次新增留言時發送 POST 請求到指定的 URL。

### 請求格式

```json
{
  "event": "comment.created",
  "timestamp": "2026-01-10T10:30:00.000Z",
  "note": {
    "id": "abc123",
    "title": "筆記標題",
    "type": "markdown",
    "shareUrl": "http://localhost:3000/s/xyz789",
    "owner": {
      "id": 1,
      "username": "creator",
      "name": "創建者名稱"
    },
    "lastEditor": {
      "id": 2,
      "username": "editor",
      "name": "編輯者名稱"
    }
  },
  "comment": {
    "id": 100,
    "content": "留言內容",
    "createdAt": "2026-01-10T10:30:00.000Z",
    "user": {
      "id": 3,
      "username": "commenter",
      "name": "留言者名稱"
    }
  },
  "parent": {
    "id": 99,
    "content": "父留言內容",
    "createdAt": "2026-01-10T10:00:00.000Z",
    "user": {
      "id": 2,
      "username": "parent_user",
      "name": "父留言者名稱"
    }
  }
}
```

> **注意**：`parent` 欄位僅在回覆現有留言時才會包含。

## 🤖 AI 助理

AI 助理功能透過後台管理介面設定，支援以下功能：
- 在筆記頁面提供 AI 聊天功能
- 支援 OpenAI 相容 API 及本地 Ollama
- 可自訂系統提示詞與建議問題

### 設定方式

1. 以管理者身份登入
2. 進入「設定」→「管理者」→「AI 助理設定」
3. 啟用 AI 功能並填入 API 設定

### Proxy 支援

若需透過代理伺服器連線 AI 服務，請設定環境變數：

```bash
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080
NO_PROXY=localhost,127.0.0.1
```

## 📄 授權

MIT License
