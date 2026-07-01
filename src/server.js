const { createApp } = require('./app');
const { env } = require('./config/env');

const app = createApp();

// Bind to 0.0.0.0 so the server is reachable from other devices on the same
// network (e.g. an Android phone during local development).
const HOST = '0.0.0.0';
app.listen(env.PORT, HOST, () => {
  console.log(`Chama Governance API listening on http://${HOST}:${env.PORT}`);
  console.log(`Local access: http://localhost:${env.PORT}`);
  console.log(`Network access: http://192.168.100.33:${env.PORT}`);
});

