const config = require('../config');

module.exports = (sequelize, DataTypes) => {
    const Book = sequelize.define('Book', {
        id: {
            type: DataTypes.STRING(9),
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
        },
        shareId: {
            type: DataTypes.STRING(7),
            allowNull: true,
            unique: true
        },
        shareAlias: {
            type: DataTypes.STRING(50),
            allowNull: true,
            unique: true
        },
        isSystem: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            comment: '系統書本標記'
        }
    }, {
        paranoid: true
    });
    return Book;
};
