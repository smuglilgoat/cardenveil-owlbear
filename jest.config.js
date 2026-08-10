export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.svelte$': [
      'svelte-jester',
      {
        preprocess: true
      }
    ],
    '^.+\\.js$': 'babel-jest'
  },
  moduleFileExtensions: ['js', 'svelte'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,svelte}',
    '!src/**/*.test.js',
    '!**/node_modules/**'
  ],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '^\\$app/(.*)$': '<rootDir>/.svelte-kit/dev/runtime/app/$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@supabase)/)'
  ]
};
