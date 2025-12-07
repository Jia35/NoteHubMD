module.exports = (sequelize, DataTypes) => {
    const Book = sequelize.define('Book', {
        id: {
            type: DataTypes.STRING(8),
            primaryKey: true
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        permission: {
            type: DataTypes.STRING,
            defaultValue: 'private'
        },
        tags: {
            type: DataTypes.JSON
        },
        lastEditorId: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        deletedById: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        paranoid: true
    });
    return Book;
};
