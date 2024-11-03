import { exec } from 'child_process';

export const init = () => {
	exec('git init');
};
