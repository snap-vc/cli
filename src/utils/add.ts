import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Stages files for commit using git add
 *
 * @param {string[]} files - Array of file paths to stage
 * @param {Object} options - Configuration options
 * @param {boolean} [options.patch] - Whether to run in patch mode (-p flag)
 * @returns {Promise<void>}
 * @throws {Error} If the git add command fails
 */
export async function add(
	files: string[],
	options: { patch?: boolean } = {},
): Promise<void> {
	const flags = options.patch ? '-p' : '';
	await execAsync(`git add ${flags} ${files.join(' ')}`);
}
