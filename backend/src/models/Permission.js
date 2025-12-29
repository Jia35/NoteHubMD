module.exports = (sequelize, DataTypes) => {
    const Permission = sequelize.define('Permission', {
        targetType: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isIn: [['note', 'book']]
            }
        },
        targetId: {
            type: DataTypes.STRING(9),
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        permission: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'view',
            validate: {
                isIn: [['view', 'edit']]
            }
        }
    }, {
        indexes: [
            {
                unique: true,
                fields: ['targetType', 'targetId', 'userId']
            }
        ]
    });
    return Permission;
};
