/**
 * Options for git commit command
 */
export type CommitOptions = {
	/** GPG-sign the commit (-S flag) */
	sign?: boolean;
	/** Amend the previous commit (--amend flag) */
	amend?: boolean;
	/** Allow empty commits (--allow-empty flag) */
	allowEmpty?: boolean;
	/** Skip pre-commit hooks (--no-verify flag) */
	noVerify?: boolean;
	/** Override the commit author (--author flag) */
	author?: string;
	/** Override the author date (--date flag) */
	date?: string;
};
