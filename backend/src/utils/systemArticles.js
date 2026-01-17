/**
 * System Articles Initialization
 * 系統文章初始化工具
 */
const fs = require('fs');
const path = require('path');
const db = require('../models');
const { generateId } = require('./idGenerator');

// 系統書本 ID (固定)
const SYSTEM_BOOK_ID = 'sys-book';

// 系統文章定義 (內容從 .md 檔案讀取)
const SYSTEM_ARTICLES = [
    {
        id: 'sys-intro',
        title: 'NoteHubMD 介紹',
        file: 'intro.md',
        alias: 'sys-intro',
        order: 0
    },
    {
        id: 'sys-md',
        title: 'Markdown 語法說明',
        file: 'markdown.md',
        alias: 'sys-markdown',
        order: 1
    }
];

// 系統文章內容資料夾路徑
const CONTENT_DIR = path.join(__dirname, '../content/system-articles');

/**
 * 讀取系統文章內容
 */
function readArticleContent(filename) {
    const filePath = path.join(CONTENT_DIR, filename);
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        console.error(`Failed to read system article: ${filename}`, e.message);
        return '';
    }
}

/**
 * 初始化系統文章
 * 在資料庫同步後呼叫此函數
 */
async function initSystemArticles() {
    try {
        // 檢查系統書本是否存在
        let systemBook = await db.Book.findByPk(SYSTEM_BOOK_ID);

        if (!systemBook) {
            console.log('Creating system book...');
            systemBook = await db.Book.create({
                id: SYSTEM_BOOK_ID,
                title: '📖 NoteHubMD 使用手冊',
                description: '系統說明文件與使用指南',
                permission: 'public-view',
                isPublic: true,
                isSystem: true,
                ownerId: null
            });
            console.log('System book created:', systemBook.id);
        }

        // 建立或更新系統文章
        for (const article of SYSTEM_ARTICLES) {
            const existingNote = await db.Note.findByPk(article.id);

            if (!existingNote) {
                const content = readArticleContent(article.file);
                console.log(`Creating system article: ${article.title}`);
                await db.Note.create({
                    id: article.id,
                    title: article.title,
                    content: content,
                    bookId: SYSTEM_BOOK_ID,
                    permission: 'public-view',
                    isPublic: true,
                    isSystem: true,
                    ownerId: null,
                    order: article.order,
                    shareId: generateId(7),
                    shareAlias: article.alias
                });
            }
        }

        console.log('System articles initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize system articles:', error);
    }
}

module.exports = {
    initSystemArticles,
    SYSTEM_BOOK_ID,
    SYSTEM_ARTICLES
};
