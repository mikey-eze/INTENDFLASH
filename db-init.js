require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, close } = require('./db');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('INTENDFLASH database schema is ready.');
}

main()
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
