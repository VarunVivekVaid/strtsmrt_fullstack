import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting servers...');

// Determine the correct npm executable path for Windows
const npmCommand = platform() === 'win32' ? 'npm.cmd' : 'npm';

// Start Express server using tsx (better ES module support)
const expressServer = spawn(npmCommand, ['run', 'dev:server'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3001' },
    shell: platform() === 'win32' // Use shell on Windows for better PATH resolution
});

expressServer.on('error', (err) => {
    console.error('Failed to start Express server:', err);
    console.error('This might be due to npm not being in PATH. Try running:');
    console.error('1. npm install -g npm (to ensure npm is globally available)');
    console.error('2. Or restart your terminal/command prompt');
    process.exit(1);
});

// Start Vite dev server using npm run
const viteServer = spawn(npmCommand, ['run', 'dev'], {
    stdio: 'inherit',
    shell: platform() === 'win32' // Use shell on Windows for better PATH resolution
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

// Handle process termination on Windows
process.on('SIGTERM', () => {
    console.log('\nShutting down servers...');
    expressServer.kill();
    viteServer.kill();
    process.exit(0);
}); 