import { join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { getConfigDir } from '../os';
import http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { t } from '../i18n';

const execAsync = promisify(exec);
const CONFIG_FILE = join(getConfigDir(), 'config.json');
const AUTH_URL = 'https://snap.choco.rip/auth/cli';

interface Config {
	authToken?: string;
	userId?: string;
}

export function getConfig(): Config {
	if (!existsSync(CONFIG_FILE)) {
		return {};
	}
	return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

export function saveConfig(config: Config): void {
	if (!existsSync(getConfigDir())) {
		mkdirSync(getConfigDir(), { recursive: true });
	}
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function openBrowser(url: string): Promise<void> {
	const cmd =
		process.platform === 'win32' ? 'start'
		: process.platform === 'darwin' ? 'open'
		: 'xdg-open';

	await execAsync(`${cmd} ${url}`);
}

export async function login(): Promise<void> {
	return new Promise((resolve, reject) => {
		// Create local server to receive the auth callback
		const server = http.createServer(async (req, res) => {
			try {
				const url = new URL(req.url!, `http://${req.headers.host}`);
				const token = url.searchParams.get('token');
				const userId = url.searchParams.get('userId');

				if (token && userId) {
					saveConfig({ authToken: token, userId });
					res.writeHead(200, { 'Content-Type': 'text/html' });
					res.end(
						'<h1>Authentication successful! You can close this window.</h1>',
					);
					server.close();
					resolve();
				} else {
					throw new Error(t('auth.invalid_response'));
				}
			} catch (error) {
				reject(error);
			}
		});

		// Start server on random port
		server.listen(0, async () => {
			const { port } = server.address() as { port: number };
			const loginUrl = `${AUTH_URL}?port=${port}`;

			// Open browser for authentication
			try {
				await openBrowser(loginUrl);
				console.log(t('auth.browser_fallback'));
				console.log(loginUrl);
			} catch (error) {
				console.log(t('auth.browser_fallback'));
				console.log(loginUrl);
			}
		});

		// Timeout after 5 minutes
		setTimeout(() => {
			server.close();
			reject(new Error(t('auth.timeout')));
		}, 300000);
	});
}

export async function logout(): Promise<void> {
	saveConfig({});
}

export function isAuthenticated(): boolean {
	const config = getConfig();
	return Boolean(config.authToken);
}
