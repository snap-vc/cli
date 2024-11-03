import { exec } from 'child_process';
import { promisify } from 'util';
import { runHook } from '../hooks';

const execAsync = promisify(exec);

/**
 * Options for git push command
 */
interface PushOptions {
	/** Force push with lease */
	force?: boolean;
	/** Set upstream tracking reference */
	setUpstream?: boolean;
}

/**
 * Pushes commits to a remote repository
 *
 * @param {string} remote - Name of the remote repository
 * @param {string} [branch] - Branch to push (defaults to current branch)
 * @param {PushOptions} [options] - Push options
 * @param {boolean} [options.force] - Force push with lease (-f flag)
 * @param {boolean} [options.setUpstream] - Set upstream tracking (-u flag)
 * @throws {Error} If the push command fails
 */
export async function push(
	remote: string,
	branch?: string,
	options: PushOptions = {},
): Promise<void> {
	const flags = [options.force && '-f', options.setUpstream && '-u']
		.filter(Boolean)
		.join(' ');

	const command = `git push ${flags} ${remote} ${branch || ''}`.trim();
	await execAsync(command);
	await runHook('post-push');
}
