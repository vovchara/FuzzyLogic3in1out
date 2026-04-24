module.exports = {
  testEnvironment: 'node',
  collectCoverage: false, // За замовчуванням вимкнено для швидкості
  coverageDirectory: 'coverage',
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!server.js',
    '!jest.config.js',
    '!coverage/**'
  ],
  // Дозволяємо Jest трансформувати ES модулі з @thi.ng пакетів
  transformIgnorePatterns: [
    '/node_modules/(?!(@thi\\.ng)/)'
  ],
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  verbose: false,
  testTimeout: 5000
};
