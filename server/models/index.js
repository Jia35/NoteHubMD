const Sequelize = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database/database.sqlite'),
    logging: false
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.User = require('./User')(sequelize, Sequelize);
db.Book = require('./Book')(sequelize, Sequelize);
db.Note = require('./Note')(sequelize, Sequelize);

// Associations
db.User.hasMany(db.Book, { foreignKey: 'ownerId' });
db.Book.belongsTo(db.User, { foreignKey: 'ownerId', as: 'owner' });

db.User.hasMany(db.Note, { foreignKey: 'ownerId' });
db.Note.belongsTo(db.User, { foreignKey: 'ownerId', as: 'owner' });

db.Book.hasMany(db.Note, { foreignKey: 'bookId' });
db.Note.belongsTo(db.Book, { foreignKey: 'bookId' });

// LastEditor associations
db.Book.belongsTo(db.User, { foreignKey: 'lastEditorId', as: 'lastEditor' });
db.Note.belongsTo(db.User, { foreignKey: 'lastEditorId', as: 'lastEditor' });

// DeletedBy associations
db.Book.belongsTo(db.User, { foreignKey: 'deletedById', as: 'deletedBy' });
db.Note.belongsTo(db.User, { foreignKey: 'deletedById', as: 'deletedBy' });

module.exports = db;
