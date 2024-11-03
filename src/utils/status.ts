import { exec } from 'child_process';
import { promisify } from 'util';
import { t } from '../i18n';
import chalk from 'chalk';

const execAsync = promisify(exec);

/**
 * Represents the current state of the git repository
 */
interface StatusInfo {
	/** Current branch name */
	branch: string;
	/** Whether working directory is clean */
	isClean: boolean;
	/** Files staged for commit */
	staged: string[];
	/** Files with unstaged changes */
	unstaged: string[];
	/** Untracked files */
	untracked: string[];
	/** Number of commits ahead of remote */
	ahead: number;
	/** Number of commits behind remote */
	behind: number;
	/** Whether this is the first commit */
	initialCommit: boolean;
}

/**
 * Parses the output of git status command
 *
 * @returns {Promise<StatusInfo>} Parsed status information
 * @throws {Error} If git status command fails
 */
async function parseGitStatus(): Promise<StatusInfo> {
	const { stdout } = await execAsync('git status --porcelain -b');
	const lines = stdout.split('\n').filter(Boolean);

	const status: StatusInfo = {
		branch: 'unknown',
		isClean: lines.length <= 1,
		staged: [],
		unstaged: [],
		untracked: [],
		ahead: 0,
		behind: 0,
		initialCommit: false,
	};

	// Parse branch line
	const branchLine = lines[0];
	if (branchLine.startsWith('## ')) {
		const branchInfo = branchLine.substring(3);
		const match = branchInfo.match(
			/^(?:No commits yet on )?([^.]+)(?:\.\.\.(?:.*?)(?:\[ahead (\d+)(?:, behind (\d+))?\])?)?$/,
		);
		if (match) {
			status.branch = match[1];
			status.ahead = parseInt(match[2] || '0');
			status.behind = parseInt(match[3] || '0');
			status.initialCommit = branchInfo.startsWith('No commits yet');
		}
	}

	// Parse file statuses
	for (const line of lines.slice(1)) {
		const [state, file] = [line.substring(0, 2), line.substring(3)];
		if (state[0] !== ' ' && state[0] !== '?') status.staged.push(file);
		if (state[1] !== ' ') status.unstaged.push(file);
		if (state === '??') status.untracked.push(file);
	}

	return status;
}

/**
 * Gets formatted git status output
 *
 * @param {boolean} [short=false] - Use short format output
 * @returns {Promise<string>} Formatted status message
 * @throws {Error} If status command fails
 */
export async function status(short = false): Promise<string> {
	const statusInfo = await parseGitStatus();

	if (short) {
		return formatShortStatus(statusInfo);
	}

	const lines: string[] = [];

	// Branch info
	lines.push(t('status.on_branch', chalk.green(statusInfo.branch)));
	lines.push('');

	if (statusInfo.initialCommit) {
		lines.push(chalk.red(t('status.no_commits')));
		lines.push('');
	}

	if (statusInfo.ahead || statusInfo.behind) {
		const parts = [];
		if (statusInfo.ahead)
			parts.push(
				`${chalk.green(t('status.ahead', statusInfo.ahead))} ${t('status.commits')}`,
			);
		if (statusInfo.behind)
			parts.push(
				`${chalk.red(t('status.behind', statusInfo.behind))} ${t('status.commits')}`,
			);
		lines.push(t('status.your_branch_is', parts.join(` ${t('status.and')} `)));
		lines.push('');
	}

	if (statusInfo.isClean) {
		lines.push(chalk.green(t('status.clean')));
		return lines.join('\n');
	}

	// Staged files
	if (statusInfo.staged.length) {
		lines.push(chalk.green(t('status.staged_header')));
		lines.push(chalk.dim(t('status.staged_help')));
		lines.push('');
		formatFileList(lines, statusInfo.staged, '+', chalk.green);
		lines.push('');
	}

	// Unstaged files
	const modifiedFiles = statusInfo.unstaged.filter(
		(file) => !statusInfo.untracked.includes(file),
	);
	if (modifiedFiles.length) {
		lines.push(chalk.yellow(t('status.unstaged_header')));
		lines.push(chalk.dim(t('status.unstaged_help_1')));
		lines.push(chalk.dim(t('status.unstaged_help_2')));
		lines.push('');
		formatFileList(lines, modifiedFiles, '±', chalk.yellow);
		lines.push('');
	}

	// Untracked files
	if (statusInfo.untracked.length) {
		lines.push(chalk.red(t('status.untracked_header')));
		lines.push(chalk.dim(t('status.untracked_help')));
		lines.push('');
		formatFileList(lines, statusInfo.untracked, '??', chalk.red);
		lines.push('');
	}

	// Summary line
	const summary = [];
	if (statusInfo.staged.length) {
		summary.push(
			chalk.green(t('status.staged_count', statusInfo.staged.length)),
		);
	}
	if (modifiedFiles.length) {
		summary.push(
			chalk.yellow(t('status.modified_count', modifiedFiles.length)),
		);
	}
	if (statusInfo.untracked.length) {
		summary.push(
			chalk.red(t('status.untracked_count', statusInfo.untracked.length)),
		);
	}

	if (summary.length) {
		lines.push(t('status.summary', summary.join(', ')));
		if (!statusInfo.staged.length) {
			lines.push(chalk.dim(t('status.tip')));
		}
	}

	return lines.join('\n');
}

/**
 * Formats a list of files with numbers and symbols
 *
 * @param {string[]} lines - Array to append formatted lines to
 * @param {string[]} files - Files to format
 * @param {string} symbol - Symbol to prefix each file with
 * @param {Function} colorFn - Function to apply color formatting
 */
function formatFileList(
	lines: string[],
	files: string[],
	symbol: string,
	colorFn: (text: string) => string,
): void {
	const padding = files.length.toString().length;
	files.forEach((file, index) => {
		const number = (index + 1).toString().padStart(padding, ' ');
		lines.push(`  ${chalk.dim(number + '.')} ${colorFn(symbol)} ${file}`);
	});
}

/**
 * Formats status information in short format
 *
 * @param {StatusInfo} statusInfo - Repository status information
 * @returns {string} Short format status message
 */
function formatShortStatus(statusInfo: StatusInfo): string {
	const lines: string[] = [];

	// Staged files
	statusInfo.staged.forEach((file) => {
		lines.push(chalk.green(`A  ${file}`));
	});

	// Modified files (not untracked)
	statusInfo.unstaged
		.filter((file) => !statusInfo.untracked.includes(file))
		.forEach((file) => {
			lines.push(chalk.yellow(`M  ${file}`));
		});

	// Untracked files
	statusInfo.untracked.forEach((file) => {
		lines.push(chalk.red(`?? ${file}`));
	});

	return lines.join('\n');
}
