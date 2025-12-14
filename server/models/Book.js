const config = require('../config');

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
        tags: {
            type: DataTypes.JSON
        },
        permission: {
            type: DataTypes.STRING,
            defaultValue: config.defaults.bookPermission
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        lastUpdaterId: {
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
