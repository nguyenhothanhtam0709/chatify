import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // oxlint-disable-next-line no-restricted-properties -- drizzle-kit loads this file on its own, outside Nest, so loadConfig and ConfigService are not available
    url: process.env['DATABASE_URL'] ?? 'postgres://chat:chat@localhost:5432/chat',
  },
});
