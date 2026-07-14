// Flat ESLint config for the Expo app (https://docs.expo.dev/guides/using-eslint/).
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
];
