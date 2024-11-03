import { exec } from 'child_process';
import { promisify } from 'util';
import { runHook } from '../hooks';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Clones a remote repository
 * @param {string} url - URL of the remote repository
 * @param {string} dir - Directory to clone the repository to
 */
export async function clone(url: string, dir: string | undefined) {
	try {
		// Normalize the directory path
		const repoName = url.split('/').pop()?.split('.').shift();
		const targetDir = path.normalize(
			dir?.replace('/', path.sep) || repoName || '',
		);

		await execAsync(`git clone ${url} ${targetDir}`);
		const oldDir = process.cwd();

		try {
			process.chdir(targetDir);
			await runHook('post-clone');
		} finally {
			// Ensure we always return to the original directory
			process.chdir(oldDir);
		}
	} catch (error) {
		throw new Error(
			`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}
