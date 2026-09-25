/**
 * Grants (or confirms) admin-dashboard access for one account:
 *   node src/scripts/promoteAdmin.js someone@example.com
 *
 * Idempotent and CLI-arg driven on purpose — no signup flow exists for
 * admins, so this is how the first (and any later) admin account gets
 * created. Run it locally with api/.env's MONGO_URI pointed at whichever
 * database (local or the real production Atlas cluster) you actually want
 * to grant access on.
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node src/scripts/promoteAdmin.js <email>');
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { $set: { role: 'admin' } },
    { new: true }
  ).select('email role');

  if (!user) {
    console.error(`[PromoteAdmin] No user found for ${email}`);
  } else {
    console.log(`[PromoteAdmin] ${user.email} is now role: ${user.role}`);
  }

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error('[PromoteAdmin] Failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
