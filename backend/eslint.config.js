import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Layer boundary: controllers must not touch the data layer.
    // Move any DB / model / sequelize work into a service.
    files: ['src/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'sequelize', message: 'Controllers must not import sequelize. Move logic to a service.' },
        ],
        patterns: [
          { group: ['**/db.js', '**/db'], message: 'Controllers must not touch the DB. Move logic to a service.' },
          { group: ['**/models/*', '**/models'], message: 'Controllers must not import models. Move logic to a service.' },
        ],
      }],
    },
  },
])
