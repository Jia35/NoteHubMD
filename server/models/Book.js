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
        }
    }, {
        paranoid: true
    });
    return Book;
};
