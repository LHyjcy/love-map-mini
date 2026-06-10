// PM2 process config for the love-map-mini API.
//
// IMPORTANT: real secrets (DATABASE_URL, JWT_SECRET, WeChat/COS keys, etc.)
// must come from the shell environment or a NON-COMMITTED .env file loaded by
// the app — NOT from this file. Do not put real credentials here.
//
// Usage:
//   pm2 start ecosystem.config.cjs --env production
//
// Build first (npm run build) and run `npx prisma migrate deploy` on release.

module.exports = {
  apps: [
    {
      name: 'love-map-api',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
