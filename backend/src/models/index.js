const config = require('../config');
const Sequelize = require('sequelize');

// Build Sequelize options based on dialect
let sequelizeOptions = {
    dialect: config.database.dialect,
    logging: config.database.logging
};

if (config.database.dialect === 'sqlite') {
    // SQLite configuration
    sequelizeOptions.storage = config.database.storage;
} else {
    // PostgreSQL / MySQL / other SQL databases
    sequelizeOptions.host = config.database.host;
    sequelizeOptions.port = config.database.port;
}

const sequelize = config.database.dialect === 'sqlite'
    ? new Sequelize(sequelizeOptions)
    : new Sequelize(
        config.database.name,
        config.database.username,
        config.database.password,
        sequelizeOptions
    );

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = require('./User')(sequelize, Sequelize);
db.Book = require('./Book')(sequelize, Sequelize);
db.Note = require('./Note')(sequelize, Sequelize);
db.Permission = require('./Permission')(sequelize, Sequelize);
db.Comment = require('./Comment')(sequelize, Sequelize);
db.NoteRevision = require('./NoteRevision')(sequelize, Sequelize);

// Associations
db.User.hasMany(db.Book, { foreignKey: 'ownerId' });
db.Book.belongsTo(db.User, { foreignKey: 'ownerId', as: 'owner' });

db.User.hasMany(db.Note, { foreignKey: 'ownerId' });
db.Note.belongsTo(db.User, { foreignKey: 'ownerId', as: 'owner' });

db.Book.hasMany(db.Note, { foreignKey: 'bookId' });
db.Note.belongsTo(db.Book, { foreignKey: 'bookId' });

// LastEditor associations
db.Book.belongsTo(db.User, { foreignKey: 'lastUpdaterId', as: 'lastUpdater' });
db.Note.belongsTo(db.User, { foreignKey: 'lastEditorId', as: 'lastEditor' });

// LastUpdater association (for Notes - tracks any modification)
db.Note.belongsTo(db.User, { foreignKey: 'lastUpdaterId', as: 'lastUpdater' });

// DeletedBy associations
db.Book.belongsTo(db.User, { foreignKey: 'deletedById', as: 'deletedBy' });
db.Note.belongsTo(db.User, { foreignKey: 'deletedById', as: 'deletedBy' });

// Permission associations
db.Permission.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
db.User.hasMany(db.Permission, { foreignKey: 'userId' });

// Polymorphic association for Note permissions
db.Note.hasMany(db.Permission, {
    foreignKey: 'targetId',
    constraints: false,
    scope: { targetType: 'note' },
    as: 'permissions'
});

// Comment associations
db.Note.hasMany(db.Comment, { foreignKey: 'noteId' });
db.Comment.belongsTo(db.Note, { foreignKey: 'noteId' });
db.User.hasMany(db.Comment, { foreignKey: 'userId' });
db.Comment.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// Comment reply self-reference
db.Comment.belongsTo(db.Comment, { foreignKey: 'parentId', as: 'parent' });
db.Comment.hasMany(db.Comment, { foreignKey: 'parentId', as: 'replies' });

// CommentReaction model and associations
db.CommentReaction = require('./CommentReaction')(sequelize, Sequelize);
db.Comment.hasMany(db.CommentReaction, { foreignKey: 'commentId', as: 'reactions' });
db.CommentReaction.belongsTo(db.Comment, { foreignKey: 'commentId' });
db.User.hasMany(db.CommentReaction, { foreignKey: 'userId' });
db.CommentReaction.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// NoteRevision associations
db.Note.hasMany(db.NoteRevision, { foreignKey: 'noteId', as: 'revisions' });
db.NoteRevision.belongsTo(db.Note, { foreignKey: 'noteId' });
db.NoteRevision.belongsTo(db.User, { foreignKey: 'editorId', as: 'editor' });

// NoteReaction model and associations
db.NoteReaction = require('./NoteReaction')(sequelize, Sequelize);
db.Note.hasMany(db.NoteReaction, { foreignKey: 'noteId', as: 'noteReactions' });
db.NoteReaction.belongsTo(db.Note, { foreignKey: 'noteId' });
db.User.hasMany(db.NoteReaction, { foreignKey: 'userId' });
db.NoteReaction.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// SystemSetting model (Key-Value store for system configurations)
db.SystemSetting = require('./SystemSetting')(sequelize, Sequelize);

module.exports = db;

