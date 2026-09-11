import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.srluna.astrometeo',
  appName: 'AstroMeteo',
  webDir: 'dist',
  server: { androidScheme: 'https' },
}

export default config
