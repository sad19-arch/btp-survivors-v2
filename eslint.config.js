import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'node_modules/**',
      '.remember/**',
      '.superpowers/**',
      'tools/assets/*.mjs',
      '*.config.js',
      '*.config.ts'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true }
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all']
    }
  },
  // Le cœur de simulation : règles renforcées de déterminisme.
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Déterminisme: utiliser le Clock injecté, pas Date dans le cœur.' }
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Déterminisme: utiliser le Rng à seed, pas Math.random dans le cœur.' },
        { object: 'Date', property: 'now', message: 'Déterminisme: utiliser le Clock injecté, pas Date.now dans le cœur.' }
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Déterminisme: pas de new Date() dans le cœur.' }
      ]
    }
  },
  // Le cœur ne doit jamais importer Phaser ni le DOM.
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'phaser', message: 'Le cœur de simulation ne doit pas importer Phaser (séparation sim/render).' }] }
      ]
    }
  },
  // Tests et outils : on relâche quelques contraintes.
  {
    files: ['tests/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  }
)
