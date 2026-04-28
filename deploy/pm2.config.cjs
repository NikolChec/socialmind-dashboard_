// PM2 process config — keeps the backend alive and auto-restarts it.
module.exports = {
  apps: [
    {
      name: 'socialmind-backend',
      script: 'backend/dist/index.js',
      cwd: '/home/socialmind/app',
      node_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
  ],
};
