const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020, sourceType: 'script',
      globals: { window: 'readonly', document: 'readonly', console: 'readonly', MouseEvent: 'readonly' }
    },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] }
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly', process: 'readonly', console: 'readonly' }
    }
  }
];
