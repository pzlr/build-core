declare namespace PzlrBuildCore {
	interface DeclarationObject {
		name: string;
		mixin?: boolean;
		parent?: string | null;
		dependencies?: string[];
		libs?: string[];
	}

	type DeclarationObjectFull = {
		[P in keyof DeclarationObject]: DeclarationObject[P];
	};

	interface BlockTypes {
		readonly i: 'interface';
		readonly b: 'block';
		readonly p: 'page';
		readonly g: 'global';
		readonly v: 'virtual';
	}

	type BlockTypeList = ['i', 'b', 'p', 'g', 'v'];

	type BlockFullType = 'interface' | 'block' | 'page' | 'global' | 'virtual';

	class Declaration {
		static readonly blockTypes: BlockTypes;

		static readonly blockTypeList: BlockTypeList;

		static parse(declaration: string, test?): Declaration;

		readonly name: string;

		readonly type: BlockFullType;

		readonly parent: string | null;

		readonly mixin: boolean;

		readonly dependencies: ReadonlyArray<string>;

		readonly libs: ReadonlyArray<string>;

		constructor(declaration: string | DeclarationObject);

		toJSON(): DeclarationObjectFull;

		toString(): string;
	}

	type BlockMap = Map<string, Block>;

	class Block {
		static get(name: string): Promise<Block>;

		static getAll(names?: string[]): Promise<BlockMap>;

		readonly name: string;

		readonly type: BlockFullType;

		readonly parent: string | null;

		readonly mixin: boolean;

		readonly dependencies: ReadonlyArray<string>;

		readonly libs: ReadonlyArray<string>;

		constructor(declaration: Declaration);

		getParent(): Promise<Block | null>;
		getParent({cache}: {cache?: BlockMap}): Promise<Block | null>;

		getDependencies(): Promise<BlockMap>;
		getDependencies({onlyOwn, cache}: {onlyOwn?: boolean; cache?: BlockMap}): Promise<BlockMap>;

		getLibs(): Promise<Set<string>>;
		getLibs({onlyOwn, cache}: {onlyOwn?: boolean; cache?: BlockMap}): Promise<Set<string>>;

		getRuntimeDependencies(): Promise<{runtime: BlockMap, parents: BlockMap, libs: Set<string>}>;
		getRuntimeDependencies({cache}: {cache?: BlockMap}): Promise<{runtime: BlockMap; parents: BlockMap; libs: Set<string>}>;
	}
}

export const config: {
	readonly sourceDir: string;

	readonly blockDir: string;

	readonly entriesDir: string;

	readonly projectType: 'ts' | 'js' | 'static';

	readonly disclaimer: string | null;

	readonly dependencies: string[] | {src: string; exclude: string[]};
};

export const validators: {
	readonly baseBlockName: string;

	readonly blockTypes: PzlrBuildCore.BlockTypes;

	readonly blockTypeList: PzlrBuildCore.BlockTypeList;

	readonly blockNameRegExp: RegExp;

	readonly blockDepRegExp: RegExp;

	blockName(name: string): boolean;

	declaration(declaration: any): PzlrBuildCore.DeclarationObjectFull;
};

export const declaration: PzlrBuildCore.Declaration;

export const resolve: {
	readonly cwd: string;

	readonly lib: string;

	readonly depMap: Record<string, {src: string; exclude: Set<string>; config: typeof config}>;

	readonly sourceDir: string;

	readonly sourceDirs: string[];

	readonly dependencies: string[];

	readonly rootDependencies: string[];

	readonly entryDependencies: string[];

	block(name?: string): Promise<string | null>;
	block(name: string, skip: number): Promise<{path: string; from: number} | null>;

	entry(name?: string): string;
};

export const block: PzlrBuildCore.Block;

interface Entry {
	path: string;
	source: string;
	parent: string | null;
}

interface BuildConfig {
	entries: {
		[name: string]: Entry;
	};

	filter(cb: (el: Entry, key: string) => any): BuildConfig;

	dependencies: {
		[name: string]: string[];
	};

	commons: {
		[name: string]: string[];
	};
}

export const entries: {
	getBuildConfig(): BuildConfig;
};
