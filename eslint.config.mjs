import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'bundle*.js', 'dist/**', 'debug/**']
  },
  {
    files: ['src/**/*.js', 'i18n/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        L: 'readonly',
        // Node globals
        global: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      indent: [2, 2],
      'comma-dangle': [2, 'never'],
      'space-before-blocks': 2,
      'keyword-spacing': 2,
      'space-unary-ops': 2,
      'no-use-before-define': [2, 'nofunc'],
      camelcase: 0,
      'comma-style': 2,
      eqeqeq: 0,
      'new-cap': 2,
      'no-new': 2,
      'brace-style': 2,
      'no-multi-spaces': 0,
      'no-underscore-dangle': 0,
      'no-self-compare': 2,
      'no-void': 2,
      'no-eq-null': 2,
      quotes: 0,
      curly: 0,
      'dot-notation': 0,
      'no-shadow': 0,
      'no-alert': 0,
      'consistent-return': 0
    }
  }
];
