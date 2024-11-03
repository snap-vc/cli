import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { t } from '../i18n';

const execAsync = promisify(exec);

interface RepoInfo {
	remotes: { name: string; url: string }[];
	lastCommit: {
		hash: string;
		author: string;
		date: string;
		message: string;
	};
	stats: {
		totalCommits: number;
		totalBranches: number;
		contributors: number;
		filesTracked: number;
		repoSize: string;
	};
	config: Record<string, string>;
}

interface ContributorStats {
	names: string[];
	commits: number[];
}

interface CommitActivity {
	dates: string[];
	commits: number[];
}

async function getRepoInfo(): Promise<RepoInfo> {
	const info: RepoInfo = {
		remotes: [],
		lastCommit: {
			hash: '',
			author: '',
			date: '',
			message: '',
		},
		stats: {
			totalCommits: 0,
			totalBranches: 0,
			contributors: 0,
			filesTracked: 0,
			repoSize: '0',
		},
		config: {},
	};

	// Get remotes
	const { stdout: remoteOutput } = await execAsync('git remote -v');
	const remoteLines = remoteOutput.split('\n');
	const remoteSet = new Set();
	remoteLines.forEach((line) => {
		const match = line.match(/^(\S+)\s+(\S+)/);
		if (match && !remoteSet.has(match[1])) {
			remoteSet.add(match[1]);
			info.remotes.push({ name: match[1], url: match[2] });
		}
	});

	// Get last commit info
	try {
		const { stdout: lastCommit } = await execAsync(
			'git log -1 --pretty=format:"%H%n%an%n%ad%n%s"',
		);
		const [hash, author, date, message] = lastCommit.split('\n');
		info.lastCommit = { hash, author, date, message };
	} catch (error) {
		// Repository might be empty
	}

	// Get statistics
	const [
		{ stdout: totalCommits },
		{ stdout: totalBranches },
		{ stdout: contributors },
		{ stdout: filesTracked },
		{ stdout: repoSize },
	] = await Promise.all([
		execAsync('git rev-list --count HEAD 2>/dev/null || echo "0"'),
		execAsync('git branch | wc -l'),
		execAsync('git shortlog -s HEAD | wc -l'),
		execAsync('git ls-files | wc -l'),
		execAsync('git count-objects -v'),
	]);

	info.stats = {
		totalCommits: parseInt(totalCommits.trim()),
		totalBranches: parseInt(totalBranches.trim()),
		contributors: parseInt(contributors.trim()),
		filesTracked: parseInt(filesTracked.trim()),
		repoSize: formatSize(
			parseInt(repoSize.match(/size: (\d+)/)?.[1] || '0') * 1024,
		),
	};

	// Get important config values
	const configKeys = [
		'user.name',
		'user.email',
		'core.editor',
		'core.autocrlf',
		'pull.rebase',
		'init.defaultBranch',
	];

	for (const key of configKeys) {
		try {
			const { stdout } = await execAsync(`git config --get ${key}`);
			info.config[key] = stdout.trim();
		} catch {
			// Config value not set
		}
	}

	return info;
}

function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export async function getContributorStats(): Promise<ContributorStats> {
	try {
		const { stdout } = await execAsync('git shortlog -sn HEAD');
		const lines = stdout.trim().split('\n');
		const stats: ContributorStats = { names: [], commits: [] };

		lines.forEach((line) => {
			const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
			if (match) {
				stats.commits.push(parseInt(match[1]));
				stats.names.push(match[2]);
			}
		});

		return stats;
	} catch (error) {
		console.error('Error getting contributor stats:', error);
		return { names: [], commits: [] };
	}
}

export async function getCommitActivity(): Promise<CommitActivity> {
	try {
		// Get commits from the last 30 days
		const { stdout } = await execAsync(
			'git log --date=short --format="%ad" --since="30 days ago"',
		);

		// Create a map to store commit counts per day
		const commitMap = new Map<string, number>();

		// Initialize the last 30 days with 0 commits
		const today = new Date();
		for (let i = 0; i < 30; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split('T')[0];
			commitMap.set(dateStr, 0);
		}

		// Count commits per day
		stdout
			.trim()
			.split('\n')
			.forEach((date) => {
				if (date) {
					commitMap.set(date, (commitMap.get(date) || 0) + 1);
				}
			});

		// Convert to arrays for the chart
		const sortedDates = Array.from(commitMap.keys()).sort();
		const activity: CommitActivity = {
			dates: sortedDates,
			commits: sortedDates.map((date) => commitMap.get(date) || 0),
		};

		return activity;
	} catch (error) {
		console.error('Error getting commit activity:', error);
		return { dates: [], commits: [] };
	}
}

export async function formatRepoInfo(): Promise<string> {
	const info = await getRepoInfo();
	const lines: string[] = [];

	// Repository Remotes
	lines.push(chalk.cyan(t('info.remotes')));
	if (info.remotes.length) {
		info.remotes.forEach((remote) => {
			lines.push(`  ${chalk.green(remote.name.padEnd(10))} ${remote.url}`);
		});
	} else {
		lines.push(`  ${chalk.dim(t('info.no_remotes'))}`);
	}
	lines.push('');

	// Last Commit
	lines.push(chalk.cyan(t('info.last_commit')));
	if (info.lastCommit.hash) {
		lines.push(
			`  ${chalk.dim(t('info.hash'))}     ${info.lastCommit.hash.substring(0, 8)}`,
		);
		lines.push(`  ${chalk.dim(t('info.author'))}   ${info.lastCommit.author}`);
		lines.push(`  ${chalk.dim(t('info.date'))}     ${info.lastCommit.date}`);
		lines.push(`  ${chalk.dim(t('info.message'))}  ${info.lastCommit.message}`);
	} else {
		lines.push(`  ${chalk.dim(t('info.no_commits'))}`);
	}
	lines.push('');

	// Statistics
	lines.push(chalk.cyan(t('info.statistics')));
	lines.push(
		`  ${chalk.dim(t('info.total_commits'))}    ${info.stats.totalCommits}`,
	);
	lines.push(
		`  ${chalk.dim(t('info.total_branches'))}   ${info.stats.totalBranches}`,
	);
	lines.push(
		`  ${chalk.dim(t('info.contributors'))}     ${info.stats.contributors}`,
	);
	lines.push(
		`  ${chalk.dim(t('info.files_tracked'))}    ${info.stats.filesTracked}`,
	);
	lines.push(
		`  ${chalk.dim(t('info.repo_size'))}        ${info.stats.repoSize}`,
	);
	lines.push('');

	// Configuration
	lines.push(chalk.cyan(t('info.configuration')));
	Object.entries(info.config).forEach(([key, value]) => {
		if (value) {
			lines.push(`  ${chalk.dim(key.padEnd(20))} ${value}`);
		}
	});

	return lines.join('\n');
}
