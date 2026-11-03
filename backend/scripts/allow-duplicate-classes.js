require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');

if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;
const dnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

async function main() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env before running this migration.');
  await require('../config/db')();
  const Section = require('../models/Section');
  const indexes = await Section.collection.indexes();
  const keys = ['name', 'department', 'semester'];
  const uniqueIndexes = indexes.filter(index =>
    index.unique &&
    JSON.stringify(Object.keys(index.key)) === JSON.stringify(keys) &&
    keys.every(key => index.key[key] === 1)
  );

  for (const index of uniqueIndexes) {
    await Section.collection.dropIndex(index.name);
    console.log(`Dropped unique class index: ${index.name}`);
  }

  if (!uniqueIndexes.length) console.log('No unique class index found; duplicate class rows are enabled.');
  await mongoose.disconnect();
}

main().catch(error => {
  console.error('Could not enable duplicate class rows:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
