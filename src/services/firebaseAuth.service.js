const axios = require('axios');
const { firebaseAdmin } = require('../config/firebase');
const { env } = require('../config/env');
const { AppError } = require('../utils/errors');

const firebaseIdentityBaseUrl = 'https://identitytoolkit.googleapis.com/v1/accounts';

function firebaseError(error, fallback) {
  const message = error.response?.data?.error?.message || fallback;
  return new AppError(message, error.response?.status || 400);
}

async function registerWithEmailPassword({ email, password, fullName }) {
  try {
    const response = await axios.post(`${firebaseIdentityBaseUrl}:signUp`, {
      email,
      password,
      displayName: fullName,
      returnSecureToken: true
    }, {
      params: { key: env.FIREBASE_WEB_API_KEY }
    });

    return response.data;
  } catch (error) {
    throw firebaseError(error, 'Firebase registration failed');
  }
}

async function loginWithEmailPassword({ email, password }) {
  try {
    const response = await axios.post(`${firebaseIdentityBaseUrl}:signInWithPassword`, {
      email,
      password,
      returnSecureToken: true
    }, {
      params: { key: env.FIREBASE_WEB_API_KEY }
    });

    return response.data;
  } catch (error) {
    throw firebaseError(error, 'Firebase login failed');
  }
}

async function verifyIdToken(idToken) {
  return firebaseAdmin.auth().verifyIdToken(idToken);
}

module.exports = { registerWithEmailPassword, loginWithEmailPassword, verifyIdToken };
