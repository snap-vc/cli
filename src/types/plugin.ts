export interface SnapPlugin {
	name: string;
	version: string;
	description?: string;
	commands?: PluginCommand[];
	hooks?: PluginHook[];
	init?: () => Promise<void>;
}

export interface PluginCommand {
	name: string;
	description: string;
	alias?: string;
	action: (args: any) => Promise<void>;
	options?: PluginCommandOption[];
	arguments?: PluginCommandArgument[];
}

export interface PluginCommandOption {
	flags: string;
	description: string;
	defaultValue?: any;
}

export interface PluginCommandArgument {
	name: string;
	description: string;
	required?: boolean;
	defaultValue?: any;
}

export interface PluginHook {
	type: string;
	handler: (...args: any[]) => Promise<void>;
}
