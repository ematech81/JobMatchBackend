const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./services/socketService');
const { startCronJobs } = require('./jobs/cronPull');
const { port, clientUrl } = require('./config/env');

async function start() {
  await connectDB(); 

  const server = http.createServer(app);
  initSocket(server, { clientUrl });

  startCronJobs();

  server.listen(port, () => {
    console.log(`[Server] Running on port ${port}`);
  });
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});