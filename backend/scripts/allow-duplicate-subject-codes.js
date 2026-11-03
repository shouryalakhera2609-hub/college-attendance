require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');

if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;
const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env before running this migration.');
  await require('../config/db')();
  const indexes = await require('../models/Subject').collection.indexes();
  const uniqueCodeIndexes = indexes.filter(index =>
    index.unique &&
    Object.keys(index.key).length === 1 &&
    index.key.code === 1
  );

  for (const index of uniqueCodeIndexes) {
    await mongoose.connection.collection('subjects').dropIndex(index.name);
    console.log(`Dropped unique subject-code index: ${index.name}`);
  }

  if (!uniqueCodeIndexes.length) console.log('No unique subject-code index found; duplicate subject codes are enabled.');
  await mongoose.disconnect();
}

main().catch(error => {
  console.error('Could not enable duplicate subject codes:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
