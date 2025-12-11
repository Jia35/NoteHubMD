module.exports = (sequelize, DataTypes) => {
    const Note = sequelize.define('Note', {
        id: {
            type: DataTypes.STRING(8),
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
        permission: {
            type: DataTypes.STRING,
            defaultValue: 'private'
        },
        tags: {
            type: DataTypes.JSON
        },
        lastEditedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lastEditorId: {
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
        }
    }, {
        paranoid: true
    });
    return Note;
};
