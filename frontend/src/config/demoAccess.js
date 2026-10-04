// Explicit opt-in for the public demonstration deployment.
export function isHostedDemoBuild(env) {
  return env.PROD === true && env.DEV !== true && env.VITE_HOSTED_DEMO === 'true'
}
const env = import.meta.env || {}
export const HOSTED_DEMO = isHostedDemoBuild(env)
export const DEMO_ACCESS_ENABLED = env.DEV || HOSTED_DEMO || env.VITE_DEMO_ACCESS === 'true'
export const BACKEND_CONNECTED = env.DEV || HOSTED_DEMO || env.VITE_BACKEND_CONNECTED === 'true'
