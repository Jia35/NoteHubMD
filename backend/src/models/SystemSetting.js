/**
 * SystemSetting Model - 通用系統設定 (Key-Value/JSON)
 * 用於儲存各種系統設定，如 AI 配置、郵件設定等
 */
module.exports = (sequelize, DataTypes) => {
    const SystemSetting = sequelize.define('SystemSetting', {
        key: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
            comment: '設定鍵名 (e.g., ai_config, email_config)'
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: false,
            defaultValue: '{}',
            comment: 'JSON 字串，儲存設定內容'
        }
    }, {
        tableName: 'system_settings',
        timestamps: true
    });

    return SystemSetting;
};
