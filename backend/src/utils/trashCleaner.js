/**
 * Trash Cleaner
 * 自動刪除超過指定天數的垃圾桶內容
 */
const { Op } = require('sequelize');
const db = require('../models');
const config = require('../config');

/**
 * 清理過期的垃圾桶內容
 * @returns {Promise<{notes: number, books: number}>} 刪除的數量
 */
async function cleanExpiredTrash() {
    const autoDeleteDays = config.trash.autoDeleteDays;

    // 如果設為 0 或負數則停用自動刪除
    if (autoDeleteDays <= 0) {
        console.log('[TrashCleaner] Auto-delete is disabled (TRASH_AUTO_DELETE_DAYS <= 0)');
        return { notes: 0, books: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - autoDeleteDays);

    console.log(`[TrashCleaner] Cleaning items deleted before ${cutoffDate.toISOString()} (${autoDeleteDays} days)...`);

    try {
        // 找出過期的筆記 (paranoid 模式下 deletedAt 不為 null)
        const expiredNotes = await db.Note.findAll({
            where: {
                deletedAt: {
                    [Op.ne]: null,
                    [Op.lt]: cutoffDate
                }
            },
            paranoid: false
        });

        let notesDeleted = 0;
        for (const note of expiredNotes) {
            // 刪除相關的版本紀錄
            await db.NoteRevision.destroy({
                where: { noteId: note.id },
                force: true
            });

            // 刪除相關的留言
            await db.Comment.destroy({
                where: { noteId: note.id },
                force: true
            });

            // 刪除相關的權限
            await db.Permission.destroy({
                where: { targetId: note.id, targetType: 'note' },
                force: true
            });

            // 永久刪除筆記
            await note.destroy({ force: true });
            notesDeleted++;
        }

        // 找出過期的書本
        const expiredBooks = await db.Book.findAll({
            where: {
                deletedAt: {
                    [Op.ne]: null,
                    [Op.lt]: cutoffDate
                }
            },
            paranoid: false
        });

        let booksDeleted = 0;
        for (const book of expiredBooks) {
            // 刪除書本內的所有筆記及其相關資料
            const bookNotes = await db.Note.findAll({
                where: { bookId: book.id },
                paranoid: false
            });

            for (const note of bookNotes) {
                await db.NoteRevision.destroy({
                    where: { noteId: note.id },
                    force: true
                });
                await db.Comment.destroy({
                    where: { noteId: note.id },
                    force: true
                });
                await db.Permission.destroy({
                    where: { targetId: note.id, targetType: 'note' },
                    force: true
                });
                await note.destroy({ force: true });
            }

            // 刪除書本的權限
            await db.Permission.destroy({
                where: { targetId: book.id, targetType: 'book' },
                force: true
            });

            // 永久刪除書本
            await book.destroy({ force: true });
            booksDeleted++;
        }

        if (notesDeleted > 0 || booksDeleted > 0) {
            console.log(`[TrashCleaner] Deleted ${notesDeleted} notes and ${booksDeleted} books.`);
        } else {
            console.log('[TrashCleaner] No expired items to delete.');
        }

        return { notes: notesDeleted, books: booksDeleted };
    } catch (error) {
        console.error('[TrashCleaner] Error cleaning trash:', error);
        return { notes: 0, books: 0 };
    }
}

/**
 * 啟動定時清理任務
 * 每 24 小時執行一次
 */
function startScheduledCleanup() {
    const autoDeleteDays = config.trash.autoDeleteDays;

    // 如果設為 0 或負數則不啟動定時任務
    if (autoDeleteDays <= 0) {
        console.log('[TrashCleaner] Scheduled cleanup is disabled (TRASH_AUTO_DELETE_DAYS <= 0)');
        return;
    }

    const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
    console.log('[TrashCleaner] Scheduled cleanup enabled. Running every 24 hours.');

    // 設定定時執行
    setInterval(() => {
        cleanExpiredTrash();
    }, INTERVAL_MS);
}

module.exports = {
    cleanExpiredTrash,
    startScheduledCleanup
};
