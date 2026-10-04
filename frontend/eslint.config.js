import reactHooks from 'eslint-plugin-react-hooks'
import react from 'eslint-plugin-react'
export default [{ ignores: ['dist/**', 'node_modules/**'] }, {
  files: ['src/**/*.{js,jsx}'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: Object.fromEntries(['window','document','localStorage','sessionStorage','URL','URLSearchParams','FormData','File','Blob','fetch','console','setTimeout','clearTimeout','setInterval','clearInterval','CustomEvent','Event','BroadcastChannel','indexedDB','navigator','alert','confirm','performance','Image','FileReader','AbortController','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','atob','btoa','crypto','history','location'].map(name => [name, 'readonly'])) },
  plugins: { 'react-hooks': reactHooks, react },
  settings: { react: { version: 'detect' } },
  rules: { 'no-undef': 'error', 'react/jsx-no-undef': 'error', 'react-hooks/rules-of-hooks': 'error' }
}]
