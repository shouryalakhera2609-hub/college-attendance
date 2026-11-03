const path = require('path');
const dns = require('node:dns');
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;
const mongoDnsServers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(server => server.trim()).filter(Boolean);
if (mongoDnsServers.length) dns.setServers(mongoDnsServers);
const s = process.env.JWT_SECRET || '';
if (!process.env.MONGO_URI || s.length < 32 || /change[-_ ]?me/i.test(s)) { console.error('Set MONGO_URI and a random JWT_SECRET (>=32 chars) in backend/.env'); process.exit(1); }
const app = require('./app');
const port = Number(process.env.PORT || 5000);
require('./config/db')().then(() => {
  console.log('MongoDB connected');
  const server = app.listen(port, () => console.log(`CampusAttend frontend: http://localhost:${port}`));
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the existing server or set PORT to another port in backend/.env.`);
    } else {
      console.error('Server failed to start:', error.message);
    }
    process.exit(1);
  });
})
  .catch(e => { console.error('DB connection failed:', e.message); process.exit(1); });
