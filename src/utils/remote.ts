import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Remote {
	name: string;
	url: string;
}

/**
 * Lists all configured remotes
 *
 * @returns {Promise<Remote[]>} List of configured remotes
 * @throws {Error} If git command fails
 */
export async function listRemotes(): Promise<Remote[]> {
	const { stdout } = await execAsync('git remote -v');
	const lines = stdout.split('\n').filter(Boolean);
	const remotes: Remote[] = [];

	// Parse unique remotes (git remote -v shows each remote twice for fetch/push)
	const seen = new Set();
	lines.forEach((line) => {
		const [name, url] = line.split(/\s+/);
		if (!seen.has(name)) {
			remotes.push({ name, url });
			seen.add(name);
		}
	});

	return remotes;
}

/**
 * Adds a new remote
 *
 * @param {string} name - Name of the remote
 * @param {string} url - URL of the remote repository
 * @throws {Error} If git command fails
 */
export async function addRemote(name: string, url: string): Promise<void> {
	await execAsync(`git remote add ${name} ${url}`);
}

/**
 * Removes a remote
 *
 * @param {string} name - Name of the remote to remove
 * @throws {Error} If git command fails
 */
export async function removeRemote(name: string): Promise<void> {
	await execAsync(`git remote remove ${name}`);
}
