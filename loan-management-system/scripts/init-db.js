const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'db.json');

const db = {
  meta: {
    nextIds: { users: 2, clients: 1, loans: 1, repayments: 1, collateral: 1, company: 2 }
  },
  password_resets: [],
  users: [
    {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      provider: 'local',
      password_hash: bcrypt.hashSync('admin123', 10),
      created_at: new Date().toISOString()
    }
  ],
  clients: [],
  loans: [],
  repayments: [],
  collateral: [],
  company: [
    {
      id: 1,
      business_name: 'Campus Loan Services',
      phone: '+256700000000',
      email: 'info@example.com',
      location: 'Mbarara University',
      description: 'Small student-focused lending business.',
      repayment_terms: 'Loan repayment must follow agreed timelines to avoid collateral action.',
      payment_instructions: 'Pay by cash or mobile money and request a confirmation receipt.',
      updated_at: new Date().toISOString()
    }
  ]
};

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Database initialized at ${dbPath}`);
console.log('Default login -> email: admin@example.com OR username: admin | password: admin123');
