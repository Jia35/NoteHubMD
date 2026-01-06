module.exports = (sequelize, DataTypes) => {
    const CommentReaction = sequelize.define('CommentReaction', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        commentId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('like', 'ok', 'laugh', 'surprise', 'sad'),
            allowNull: false
        }
    }, {
        indexes: [
            {
                unique: true,
                fields: ['commentId', 'userId', 'type']
            }
        ]
    });
    return CommentReaction;
};
