require('dotenv').config();
const crypto = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);
async function hashPassword(password){ const salt=crypto.randomBytes(16).toString('hex'); const key=await scryptAsync(password,salt,64); return `scrypt:${salt}:${Buffer.from(key).toString('hex')}`; }
const { query, pool } = require('./db');

const users = [
  { id:'S5227', role:'student', rollNo:'25MRA05227', name:'Sai Swarup Reddy Polu', password:'student123', department:'CSE', year:'2nd Year', section:'E', className:'CSE-E', gender:'male', active:true },
  { id:'S5228', role:'student', rollNo:'25MRA05228', name:'Student 5228', password:'student123', department:'CSE', year:'2nd Year', section:'E', className:'CSE-E', gender:'male', active:true },
  { id:'COORD1', role:'event_coordinator', name:'Event Coordinator', password:'admin123', club:'College Events', active:true },
  { id:'COORD2', role:'coordinator', name:'Academic Coordinator', password:'admin123', active:true },
  { id:'TEACH1', role:'teacher', name:'Dr. Senthil Kumar K', password:'teacher123', active:true },
  { id:'ADMIN1', role:'admin', name:'INTENDFLASH Administrator', password:'admin123', active:true }
];

(async()=>{
  try {
    await query('BEGIN');
    for (const u of users) {
      const passwordHash = await hashPassword(u.password);
      await query(`INSERT INTO users (id,role,roll_no,name,password,department,year,section,class_name,gender,club,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, roll_no=EXCLUDED.roll_no, name=EXCLUDED.name,
        password=EXCLUDED.password, department=EXCLUDED.department, year=EXCLUDED.year, section=EXCLUDED.section,
        class_name=EXCLUDED.class_name, gender=EXCLUDED.gender, club=EXCLUDED.club, active=EXCLUDED.active`,
        [u.id,u.role,u.rollNo||null,u.name,passwordHash,u.department||null,u.year||null,u.section||null,u.className||null,u.gender||null,u.club||null,u.active]);
    }
    await query('COMMIT');
    console.log('INTENDFLASH database seeded with hashed passwords.');
  } catch (e) {
    await query('ROLLBACK').catch(()=>{});
    console.error(e);
    process.exitCode=1;
  } finally { await pool.end(); }
})();
