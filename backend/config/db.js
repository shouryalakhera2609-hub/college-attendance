const mongoose = require('mongoose');
module.exports = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
    ...(process.env.DATABASE_NAME ? { dbName: process.env.DATABASE_NAME } : {})
  });
};
