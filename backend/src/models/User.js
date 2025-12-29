module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        username: {
            type: DataTypes.STRING,
            unique: true,
            allowNull: false
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING
        },
        avatar: {
            type: DataTypes.STRING
        },
        avatarOriginal: {
            type: DataTypes.STRING
        },
        avatarCropData: {
            type: DataTypes.TEXT
        },
        role: {
            type: DataTypes.STRING,
            defaultValue: 'user',
            validate: {
                isIn: [['super-admin', 'admin', 'user']]
            }
        },
        lastActiveAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        pinnedItems: {
            type: DataTypes.TEXT,
            defaultValue: '[]',
            get() {
                const rawValue = this.getDataValue('pinnedItems');
                if (!rawValue) return [];
                try {
                    return JSON.parse(rawValue);
                } catch (e) {
                    return [];
                }
            },
            set(value) {
                this.setDataValue('pinnedItems', JSON.stringify(value || []));
            }
        }
    });
    return User;
};
