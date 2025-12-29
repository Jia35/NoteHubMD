const config = require('../config');

module.exports = (sequelize, DataTypes) => {
    const Note = sequelize.define('Note', {
        id: {
            type: DataTypes.STRING(9),
            primaryKey: true
        },
        title: {
            type: DataTypes.STRING,
            defaultValue: 'Untitled Note'
        },
        content: {
            type: DataTypes.TEXT,
            defaultValue: ''
        },
        tags: {
            type: DataTypes.JSON
        },
        bookId: {
            type: DataTypes.STRING(9),
            allowNull: true
        },
        permission: {
            type: DataTypes.STRING,
            defaultValue: config.defaults.notePermission
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        lastEditedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lastEditorId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        lastUpdaterId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        deletedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        order: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        commentsDisabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        shareId: {
            type: DataTypes.STRING(7),
            allowNull: true,
            unique: true
        },
        shareAlias: {
            type: DataTypes.STRING(64),
            allowNull: true,
            unique: true
        },
        savedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: 'Last revision save time for auto-save logic'
        }
    }, {
        paranoid: true
    });
    return Note;
};
