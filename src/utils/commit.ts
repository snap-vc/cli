import { exec } from 'child_process';
import { CommitOptions } from '../types/commit';
import { runHook } from '../hooks';

/**
 * Creates a git commit with the specified message and options
 *
 * @param {string} message - The commit message
 * @param {Object} options - Commit options
 * @param {boolean} [options.sign] - Sign the commit (-S flag)
 * @param {boolean} [options.amend] - Amend the previous commit
 * @param {boolean} [options.allowEmpty] - Allow empty commits
 * @param {boolean} [options.noVerify] - Skip pre-commit hooks
 * @param {string} [options.author] - Set specific author
 * @param {string} [options.date] - Set specific date
 * @returns {Promise<void>}
 * @throws {Error} If the commit fails
 */
export async function commit(
	message: string,
	options: CommitOptions = {},
): Promise<void> {
	await runHook('pre-commit');

	return new Promise(async (resolve, reject) => {
		const flags = [
			options.sign && '-S',
			options.amend && '--amend',
			options.allowEmpty && '--allow-empty',
			options.noVerify && '--no-verify',
			options.author && `--author="${options.author}"`,
			options.date && `--date="${options.date}"`,
		]
			.filter(Boolean)
			.join(' ');

		exec(`git commit ${flags} -m "${message}"`, (error, stdout, stderr) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});

		await runHook('post-commit');
	});
}
