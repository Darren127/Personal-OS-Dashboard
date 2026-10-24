// Creates your Personal OS login. Public sign-up is disabled, so this is the
// only way to create an account.
//
//   npm run create-user -- you@example.com
//
// You'll be prompted for a password (not shown, not saved in shell history).
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npm run create-user -- you@example.com");
  process.exit(1);
}

async function readPassword() {
  if (process.env.NEW_USER_PASSWORD) return process.env.NEW_USER_PASSWORD; // for automated tests
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (!rl.muted) rl.output.write(s); };
  return new Promise((resolve) => {
    rl.question("Password (min 10 characters): ", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    rl.muted = true;
  });
}

const password = await readPassword();
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error(`Could not create user: ${error.message}`);
  process.exit(1);
}
console.log(`Created user ${data.user.email}. You can now sign in.`);
