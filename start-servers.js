import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting servers...');

// Start Express server
const expressServer = spawn('npx', ['ts-node', 'src/server/index.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
    shell: true
});

expressServer.on('error', (err) => {
    console.error('Failed to start Express server:', err);
    process.exit(1);
});

// Start Vite dev server
const viteServer = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true
});

viteServer.on('error', (err) => {
    console.error('Failed to start Vite server:', err);
    process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nShutting down servers...');
    expressServer.kill();
    viteServer.kill();
    process.exit(0);
}); 