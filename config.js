module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'pucms-dev-secret-change-in-production',
  JWT_EXPIRES_IN: '12h',
  BCRYPT_ROUNDS: 10
};
