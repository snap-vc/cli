#! /usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { commit } from './utils/commit';
import { branch, checkout, createBranch, deleteBranch } from './utils/branch';
import { status } from './utils/status';
import { add } from './utils/add';
import { editConfig } from './utils/config';
import { push } from './utils/push';
import { appName, version } from './constants';
import { loadTranslations, t } from './i18n';
import { startServer } from './utils/web';
import { formatRepoInfo } from './utils/info';
import { init } from './utils/init';
import { addRemote, listRemotes, removeRemote } from './utils/remote';
import { clone } from './utils/clone';
import { getDocs, getDoc } from './utils/docs';
import { PluginManager } from './plugins/manager';
import { installPlugin, removePlugin } from './plugins/installer';
import { reset, restore } from './utils/reset';
import { publishPlugin } from './plugins/publisher';
import { login, logout, isAuthenticated } from './utils/auth';

loadTranslations();

const program = new Command();

/**
 * Main program configuration
 */
program.name(appName).description(t('app.description')).version(version);

// Initialize plugin manager after creating program
const pluginManager = PluginManager.getInstance(program);

// Add plugin management commands
program
	.command('plugins')
	.description(t('plugins.description'))
	.option('-l, --list', t('plugins.list_description'))
	.option('-in, --install <id>', t('plugins.install_description'))
	.option('-rm, --remove <name>', t('plugins.remove_description'))
	.option('-i, --init [template]', t('plugins.init_description'))
	.option('-p, --publish', t('plugins.publish_description'))
	.option('-u, --update', t('plugins.update_description'))
	.option('-t, --test [command...]', t('plugins.test_description'))
	.action(async (options) => {
		const spinner = ora();

		try {
			if (options.list) {
				// List plugins
				const plugins = pluginManager.getAllPlugins();
				if (plugins.length === 0) {
					console.log(chalk.yellow(t('plugins.no_plugins')));
				} else {
					console.log(chalk.cyan(t('plugins.installed_plugins')));
					plugins.forEach((plugin) => {
						console.log(`- ${plugin.name} v${plugin.version}`);
					});
				}
			} else if (options.install) {
				// Install plugin
				spinner.start(t('plugins.installing'));
				await installPlugin(options.install);
				spinner.succeed(
					chalk.green(t('plugins.install_success', options.install)),
				);
			} else if (options.remove) {
				// Remove plugin
				spinner.start(t('plugins.removing'));
				await removePlugin(options.remove);
				spinner.succeed(
					chalk.green(t('plugins.remove_success', options.remove)),
				);
			} else if (options.init) {
				// Initialize new plugin
				spinner.start(t('plugins.initializing'));
				// Add plugin initialization logic here
				spinner.succeed(
					chalk.green(t('plugins.init_success', options.init || 'default')),
				);
			} else if (options.publish) {
				// Publish plugin
				spinner.start(t('plugins.publishing'));
				await publishPlugin(true);
				spinner.succeed(chalk.green(t('plugins.publish_success')));
			} else if (options.update) {
				// Update plugin
				spinner.start(t('plugins.updating'));
				// Add plugin update logic here
				spinner.succeed(chalk.green(t('plugins.update_success')));
			} else if (options.test) {
				// Test plugin
				spinner.start(t('plugins.testing'));
				spinner.stop(); // Stop spinner to allow command output to show
				await pluginManager.testPlugin(process.cwd(), process.argv.slice(4));
				console.log(chalk.green(t('plugins.test_success')));
			} else {
				// Show usage if no option specified
				console.log(chalk.cyan(t('plugins.description')));
				console.log('\n' + t('help.usage').replace('sn', 'sn plugins'));
				console.log(`  -l, --list          ${t('plugins.list_description')}`);
				console.log(
					`  -in, --install <id> ${t('plugins.install_description')}`,
				);
				console.log(`  -rm, --remove <name>${t('plugins.remove_description')}`);
				console.log(`  -i, --init          ${t('plugins.init_description')}`);
				console.log(
					`  -p, --publish       ${t('plugins.publish_description')}`,
				);
				console.log(`  -u, --update        ${t('plugins.update_description')}`);
				console.log(`  -t, --test          ${t('plugins.test_description')}`);
			}
		} catch (error) {
			spinner.fail(chalk.red(t('common.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Initialize command
 * Initializes a new repository
 * @command init
 */
program
	.command('init')
	.description(t('init.description'))
	.action(async () => {
		await init();
	});

/**
 * Clone command
 * Clones a remote repository
 * @command clone
 * @alias cl
 * @param {string} url - URL of the remote repository
 * @param {string} dir - Directory to clone the repository to
 */
program
	.command('clone')
	.alias('cl')
	.description(t('clone.description'))
	.argument('<url>', t('clone.argument_url'))
	.argument('[dir]', t('clone.argument_dir'))
	.action(async (url, dir) => {
		const spinner = ora(t('clone.loading')).start();
		try {
			await clone(url, dir);
			spinner.succeed(chalk.green(t('clone.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('clone.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Commit command
 * Creates a new commit with the specified message and options
 * @command commit
 * @alias c
 * @param {string} message - Commit message
 * @option {boolean} -s, --sign - Sign the commit
 * @option {boolean} -a, --amend - Amend the previous commit
 * @option {boolean} -e, --allow-empty - Allow empty commits
 * @option {boolean} -n, --no-verify - Skip pre-commit hooks
 * @option {string} --author - Set specific author
 * @option {string} --date - Set specific date
 */
program
	.command('commit')
	.alias('c')
	.description(t('commit.description'))
	.argument('<message>', t('commit.argument_message'))
	.option('-s, --sign', t('commit.options_sign'))
	.option('-a, --amend', t('commit.options_amend'))
	.option('-e, --allow-empty', t('commit.options_allow_empty'))
	.option('-n, --no-verify', t('commit.options_no_verify'))
	.option('--author <name>', t('commit.options_author'))
	.option('--date <date>', t('commit.options_date'))
	.action(async (message, options) => {
		const spinner = ora(t('commit.creating')).start();

		try {
			await commit(message, {
				sign: options.sign,
				amend: options.amend,
				allowEmpty: options.allowEmpty,
				noVerify: options.noVerify,
				author: options.author,
				date: options.date,
			});

			spinner.succeed(chalk.green(t('commit.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('commit.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Docs command
 * Shows documentation for a command
 * @command docs
 * @alias d
 * @param {string} command - Command to show documentation for
 */
program
	.command('docs')
	.alias('d')
	.description(t('docs.description'))
	.argument('[command]', t('docs.argument_command'))
	.action(async (command) => {
		if (!command) {
			console.log(getDocs().join('\n'));
		} else {
			const docs = getDocs();
			if (docs.includes(command)) {
				getDoc(command);
			} else {
				console.error(chalk.red(t('docs.command_not_found', command)));
				process.exit(1);
			}
		}
	});

/**
 * Add command
 * Stages files for commit
 * @command add
 * @alias a
 * @param {string[]} [files] - Files to stage (defaults to all)
 * @option {boolean} -p, --patch - Interactively stage changes
 */
program
	.command('add')
	.alias('a')
	.description(t('add.description'))
	.argument('[files...]', t('add.argument_files'))
	.option('-p, --patch', t('add.options_patch'))
	.action(async (files, options) => {
		const spinner = ora('Staging files...').start();
		try {
			await add(files.length ? files : ['.'], options);
			spinner.succeed(chalk.green(t('add.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('add.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Branch command
 * Manages git branches
 * @command branch
 * @alias b
 * @option {boolean} -l, --list - List all branches
 * @option {string} -c, --create - Create a new branch
 * @option {string} -d, --delete - Delete a branch
 * @option {boolean} -r, --remote - Show remote branches
 */
program
	.command('branch')
	.alias('b')
	.description(t('branch.description'))
	.option('-l, --list', t('branch.options_list'))
	.option('-c, --create <name>', t('branch.options_create'))
	.option('-d, --delete <name>', t('branch.options_delete'))
	.option('-r, --remote', t('branch.options_remote'))
	.action(async (options) => {
		const spinner = ora('Processing branch operation...').start();
		try {
			if (options.create) {
				await createBranch(options.create);
				spinner.succeed(chalk.green(t('branch.created', options.create)));
			} else if (options.delete) {
				await deleteBranch(options.delete);
				spinner.succeed(chalk.green(t('branch.deleted', options.delete)));
			} else {
				const branches = await branch(options.remote);
				spinner.stop();
				console.log(chalk.cyan(t('branch.title')));
				branches.forEach((b: any) =>
					console.log(chalk.white(`  ${b.current ? '* ' : '  '}${b.name}`)),
				);
			}
		} catch (error) {
			spinner.fail(chalk.red(t('branch.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Checkout command
 * Switches branches or restores files
 * @command checkout
 * @alias co
 * @param {string} branch-or-path - Target branch or file path
 * @option {boolean} -b, --new-branch - Create and switch to new branch
 * @option {boolean} -f, --force - Force checkout
 */
program
	.command('checkout')
	.alias('co')
	.description(t('checkout.description'))
	.argument('<branch-or-path>', t('checkout.argument'))
	.option('-b, --new-branch', t('checkout.options_new_branch'))
	.option('-f, --force', t('checkout.options_force'))
	.action(async (target, options) => {
		const spinner = ora('Switching branches...').start();
		try {
			await checkout(target, options);
			spinner.succeed(chalk.green(t('checkout.success', target)));
		} catch (error) {
			spinner.fail(chalk.red(t('checkout.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Status command
 * Shows working tree status
 * @command status
 * @alias s
 * @option {boolean} -s, --short - Give output in short format
 */
program
	.command('status')
	.alias('s')
	.description(t('status.description'))
	.option('-s, --short', t('status.options_short'))
	.action(async (options) => {
		const spinner = ora(t('status.loading')).start();
		try {
			const statusInfo = await status(options.short);
			spinner.stop();
			console.log(chalk.cyan(t('status.title')));
			console.log(statusInfo);
		} catch (error) {
			spinner.fail(chalk.red(t('status.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Push command
 * Pushes commits to remote repository
 * @command push
 * @alias p
 * @param {string} [remote='origin'] - Remote repository
 * @param {string} [branch] - Branch to push
 * @option {boolean} -f, --force - Force push
 * @option {boolean} -u, --set-upstream - Set upstream branch
 */
program
	.command('push')
	.alias('p')
	.description(t('push.description'))
	.argument('[remote]', t('push.argument_remote'), 'origin')
	.argument('[branch]', t('push.argument_branch'))
	.option('-f, --force', t('push.options_force'))
	.option('-u, --set-upstream', t('push.options_set_upstream'))
	.action(async (remote, branch, options) => {
		const spinner = ora(t('push.loading')).start();
		try {
			await push(remote, branch, options);
			spinner.succeed(chalk.green(t('push.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('push.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Config command
 * Opens configuration file in default editor
 * @command config
 * @alias cfg
 */
program
	.command('config')
	.alias('cfg')
	.description(t('config.description'))
	.argument('[args...]', t('config.argument'))
	.action(async (args = []) => {
		try {
			await editConfig(...args);
		} catch (error) {
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Web command
 * Starts the web interface
 * @command web
 * @alias w
 * @option {number} -p, --port - Port to run server on
 */
program
	.command('web')
	.alias('w')
	.description(t('web.description'))
	.option('-p, --port <port>', t('web.options_port'))
	.action(async (options) => {
		await startServer(options.port);
	});

/**
 * Info command
 * Shows information about the repository
 * @command info
 * @alias i
 */
program
	.command('info')
	.alias('i')
	.description(t('info.description'))
	.action(async () => {
		const spinner = ora(t('info.loading')).start();
		try {
			const info = await formatRepoInfo();
			spinner.stop();
			console.log(info);
		} catch (error) {
			spinner.fail(chalk.red(t('info.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Remote command
 * Manages remote repositories
 * @command remote
 * @alias rm
 * @option {boolean} -l, --list - List all remotes
 * @option {string} -a, --add <name> <url> - Add a new remote
 * @option {string} -d, --delete <name> - Remove a remote
 */
program
	.command('remote')
	.alias('rm')
	.description(t('remote.description'))
	.option('-l, --list', t('remote.options_list'))
	.argument('[name]', t('remote.argument_name'))
	.argument('[url]', t('remote.argument_url'))
	.option('-d, --delete', t('remote.options_delete'))
	.action(async (name, url, options) => {
		const spinner = ora(t('remote.loading')).start();
		try {
			if (options.delete && name) {
				await removeRemote(name);
				spinner.succeed(chalk.green(t('remote.deleted', name)));
			} else if (name && url) {
				await addRemote(name, url);
				spinner.succeed(chalk.green(t('remote.added', name)));
			} else {
				const remotes = await listRemotes();
				spinner.stop();
				console.log(chalk.cyan(t('remote.title')));
				remotes.forEach((remote) => {
					console.log(chalk.white(`  ${remote.name}\t${remote.url}`));
				});
			}
		} catch (error) {
			spinner.fail(chalk.red(t('remote.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Reset command
 * Resets current HEAD to specified state
 * @command reset
 * @alias rs
 * @param {string} [commit] - Commit to reset to
 * @option {boolean} --soft - Keep changes staged
 * @option {boolean} --hard - Discard all changes
 * @option {boolean} --mixed - Unstage changes
 */
program
	.command('reset')
	.alias('rs')
	.description(t('reset.description'))
	.argument('[commit]', t('reset.argument_commit'))
	.option('--soft', t('reset.options_soft'))
	.option('--hard', t('reset.options_hard'))
	.option('--mixed', t('reset.options_mixed'))
	.action(async (commit, options) => {
		const spinner = ora(t('reset.loading')).start();
		try {
			await reset(commit, options);
			spinner.succeed(chalk.green(t('reset.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('reset.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Restore command
 * Restores working tree files
 * @command restore
 * @alias rt
 * @param {string[]} paths - Paths to restore
 * @option {string} --source - Restore from specific source
 * @option {boolean} --staged - Restore staged changes
 * @option {boolean} --worktree - Restore working tree files
 */
program
	.command('restore')
	.alias('rt')
	.description(t('restore.description'))
	.argument('<paths...>', t('restore.argument_paths'))
	.option('--source <commit>', t('restore.options_source'))
	.option('--staged', t('restore.options_staged'))
	.option('--worktree', t('restore.options_worktree'))
	.action(async (paths, options) => {
		const spinner = ora(t('restore.loading')).start();
		try {
			await restore(paths, options);
			spinner.succeed(chalk.green(t('restore.success')));
		} catch (error) {
			spinner.fail(chalk.red(t('restore.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

/**
 * Auth command
 * Handles authentication
 * @command auth
 * @option {boolean} --login - Login to Snap CLI
 * @option {boolean} --logout - Logout from Snap CLI
 * @option {boolean} --status - Check authentication status
 */
program
	.command('auth')
	.description(t('auth.description'))
	.option('--login', t('auth.options_login'))
	.option('--logout', t('auth.options_logout'))
	.option('--status', t('auth.options_status'))
	.action(async (options) => {
		const spinner = ora(t('auth.loading')).start();
		try {
			if (options.login) {
				spinner.text = t('auth.logging_in');
				await login();
				spinner.succeed(chalk.green(t('auth.login_success')));
			} else if (options.logout) {
				await logout();
				spinner.succeed(chalk.green(t('auth.logout_success')));
			} else if (options.status) {
				spinner.stop();
				if (isAuthenticated()) {
					console.log(chalk.green(t('auth.authenticated')));
				} else {
					console.log(chalk.yellow(t('auth.not_authenticated')));
				}
			} else {
				spinner.stop();
				console.log(chalk.cyan(t('auth.usage')));
			}
		} catch (error) {
			spinner.fail(chalk.red(t('auth.failed')));
			console.error(
				chalk.red(
					error instanceof Error ? error.message : t('common.error_unknown'),
				),
			);
			process.exit(1);
		}
	});

// Load plugins before parsing command line arguments
pluginManager.loadPlugins();

program.parse();
