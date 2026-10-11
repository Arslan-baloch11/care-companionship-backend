const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const readline = require('readline');
const User = require('./models/User');

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdmin() {
  try {
    const email = (
      await ask('Admin email: ')
    ).trim().toLowerCase();

    const name = (
      await ask('Admin name: ')
    ).trim();

    const password = await ask(
      'Create a strong admin password: '
    );

    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is missing in backend/.env'
      );
    }

    if (!process.env.JWT_SECRET) {
      throw new Error(
        'JWT_SECRET is missing in backend/.env'
      );
    }

    if (!email || !email.includes('@')) {
      throw new Error('Enter a valid email.');
    }

    if (name.length < 2) {
      throw new Error(
        'Name must contain at least 2 characters.'
      );
    }

    if (password.length < 12) {
      throw new Error(
        'Use a password with at least 12 characters.'
      );
    }

    await mongoose.connect(
      process.env.MONGODB_URI
    );

    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      throw new Error(
        'This email already exists. No account was changed.'
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      emailVerified: true,
      isVerified: true,
      isActive: true,
    });

    console.log(
      '\nAdmin account created successfully.'
    );
    console.log('Email:', email);
    console.log(
      'You can now sign in using your admin credentials.'
    );
  } catch (error) {
    console.error(
      '\nAdmin creation failed:',
      error.message
    );
  } finally {
    rl.close();
    await mongoose.disconnect().catch(() => {});
  }
}

createAdmin();