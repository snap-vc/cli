import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { t } from '../i18n';

const execAsync = promisify(exec);

/**
 * Represents information about a git branch
 */
export interface BranchInfo {
	/** Branch name */
	name: string;
	/** Whether this is the currently checked out branch */
	current: boolean;
	/** Whether this is a remote branch */
	remote: boolean;
	/** Name of the upstream branch if set */
	upstream?: string;
	/** Number of commits ahead of upstream */
	ahead?: number;
	/** Number of commits behind upstream */
	behind?: number;
}

/**
 * Gets information about git branches
 *
 * @param {boolean} [showRemote=false] - Whether to include remote branches
 * @returns {Promise<BranchInfo[]>} Array of branch information
 * @throws {Error} If the git branch command fails
 */
export async function branch(showRemote = false): Promise<BranchInfo[]> {
	const { stdout: branchOutput } = await execAsync(
		`git branch ${showRemote ? '-a' : ''} -vv`,
	);
	const branches = branchOutput
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const match = line.match(
				/^([*\s])\s+(\S+)\s+([a-f0-9]+)(?:\s+\[([^\]]+)\])?(?:\s+(.+))?$/,
			);
			if (!match) return null;

			const [, current, name, tracking] = match;
			let ahead = 0,
				behind = 0,
				upstream: string | undefined;

			if (tracking) {
				const trackingMatch = tracking.match(
					/([^:]+)(?:: ahead (\d+))?(?:, behind (\d+))?/,
				);
				if (trackingMatch) {
					const [, trackingUpstream, aheadStr, behindStr] = trackingMatch;
					upstream = trackingUpstream;
					ahead = aheadStr ? parseInt(aheadStr) : 0;
					behind = behindStr ? parseInt(behindStr) : 0;
				}
			}

			const branchInfo: BranchInfo = {
				name,
				current: current === '*',
				remote: name.includes('/'),
				upstream,
				ahead,
				behind,
			};

			return branchInfo;
		})
		.filter((b): b is BranchInfo => b !== null);

	return branches;
}

/**
 * Formats branch information for display
 *
 * @param {BranchInfo[]} branches - Array of branch information to format
 * @returns {string} Formatted string with branch details
 */
export function formatBranches(branches: BranchInfo[]): string {
	const lines: string[] = [];

	const localBranches = branches.filter((b) => !b.remote);
	const remoteBranches = branches.filter((b) => b.remote);

	if (localBranches.length) {
		lines.push(chalk.cyan(t('branch.local_branches')));
		localBranches.forEach((b, index) => {
			const prefix = b.current ? chalk.green('* ') : '  ';
			const name = b.current ? chalk.green(b.name) : b.name;
			const tracking = b.upstream ? chalk.dim(` [${b.upstream}`) : '';
			const ahead =
				b.ahead ? chalk.green(` ${t('branch.ahead')} ${b.ahead}`) : '';
			const behind =
				b.behind ? chalk.red(` ${t('branch.behind')} ${b.behind}`) : '';
			const closeBracket = b.upstream ? chalk.dim(']') : '';

			lines.push(
				`${prefix}${chalk.dim(`${index + 1}.`)} ${name}${tracking}${ahead}${behind}${closeBracket}`,
			);
		});
		lines.push('');
	}

	if (remoteBranches.length) {
		lines.push(chalk.cyan(t('branch.remote_branches')));
		remoteBranches.forEach((b, index) => {
			lines.push(`  ${chalk.dim(`${index + 1}.`)} ${chalk.dim(b.name)}`);
		});
	}

	return lines.join('\n');
}

/**
 * Creates a new git branch
 *
 * @param {string} name - Name of the branch to create
 * @throws {Error} If the branch creation fails
 */
export async function createBranch(name: string): Promise<void> {
	await execAsync(`git branch ${name}`);
}

/**
 * Deletes a git branch
 *
 * @param {string} name - Name of the branch to delete
 * @throws {Error} If the branch deletion fails
 */
export async function deleteBranch(name: string): Promise<void> {
	await execAsync(`git branch -D ${name}`);
}

/**
 * Checks out a git branch or path
 *
 * @param {string} target - Branch name or path to checkout
 * @param {Object} options - Checkout options
 * @param {boolean} [options.newBranch] - Create and checkout a new branch
 * @param {boolean} [options.force] - Force checkout
 * @throws {Error} If the checkout fails
 */
export async function checkout(
	target: string,
	options: { newBranch?: boolean; force?: boolean } = {},
): Promise<void> {
	const flags = [options.newBranch && '-b', options.force && '-f']
		.filter(Boolean)
		.join(' ');

	await execAsync(`git checkout ${flags} ${target}`);
}
