/**
 * NoteReaction Model
 * Stores user reactions (emoji feedback) for notes
 * Each user can only have one reaction per note
 */
module.exports = (sequelize, DataTypes) => {
    const NoteReaction = sequelize.define('NoteReaction', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        noteId: {
            type: DataTypes.STRING,
            allowNull: false,
            references: {
                model: 'Notes',
                key: 'id'
            }
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Users',
                key: 'id'
            }
        },
        type: {
            type: DataTypes.ENUM('like', 'ok', 'laugh', 'surprise', 'sad'),
            allowNull: false
        }
    }, {
        tableName: 'NoteReactions',
        indexes: [
            {
                unique: true,
                fields: ['noteId', 'userId']
            }
        ]
    });

    return NoteReaction;
};
