const { createApp } = require('./app');
const { env } = require('./config/env');

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Chama Governance API listening on port ${env.PORT}`);
});
