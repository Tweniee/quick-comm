import 'reflect-metadata';
import { createApp } from './bootstrap';
import { config } from './common/config';

async function main() {
  const app = await createApp();
  await app.listen(config.port);
  console.log(`Quick Delivery API on http://localhost:${config.port}/api`);
}
main();
