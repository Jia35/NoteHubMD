const config = require('../config');

module.exports = (sequelize, DataTypes) => {
    const NoteRevision = sequelize.define('NoteRevision', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        noteId: {
            type: DataTypes.STRING(9),
            allowNull: false
        },
        patch: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'diff-match-patch format difference from previous version'
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: 'Full content - only stored for the latest revision'
        },
        length: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            comment: 'Content length at this revision'
        },
        editorId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'User who made this revision'
        }
    }, {
        updatedAt: false, // Revisions are immutable, only createdAt matters
        indexes: [
            {
                fields: ['noteId', 'createdAt']
            }
        ]
    });

    return NoteRevision;
};
