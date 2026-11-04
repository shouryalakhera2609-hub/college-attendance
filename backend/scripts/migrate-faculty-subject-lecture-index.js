require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');

if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;
const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env before running this migration.');
  await require('../config/db')();
  const collection = require('../models/FacultySubjectHistory').collection;
  const indexes = await collection.indexes();
  const oldIndexes = indexes.filter(index =>
    index.unique &&
    Object.keys(index.key).length === 3 &&
    index.key.faculty === 1 &&
    index.key.catalogId === 1 &&
    index.key.date === 1
  );

  for (const index of oldIndexes) {
    await collection.dropIndex(index.name);
    console.log(`Dropped date-only faculty subject history index: ${index.name}`);
  }

  await collection.createIndex(
    { faculty: 1, catalogId: 1, date: 1, lectureNo: 1 },
    { unique: true }
  );
  console.log('Created unique faculty subject history index including lecture number.');
  await mongoose.disconnect();
}

main().catch(error => {
  console.error('Could not update faculty subject history indexes:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
