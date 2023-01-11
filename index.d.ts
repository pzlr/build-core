/// <reference lib="es2015"/>

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

	type Nullable<T> = T | null | undefined;
	type CanArray<T> = T | T[];

	class Declaration {
		static readonly blockTypes: BlockTypes;
		static readonly blockTypeList: BlockTypeList;
		static parse(declaration: string, test?): Declaration;

		readonly name: string;
		readonly type: BlockFullType;
		readonly parent: Nullable<string>;
		readonly mixin: boolean;
		readonly dependencies: CanArray<Nullable<string>>[];
		readonly libs: CanArray<Nullable<string>>[];

		constructor(declaration: string | DeclarationObject);

		toJSON(): DeclarationObjectFull;
		toString(): string;
	}

	type BlockMap = Map<string, Block>;
	interface RuntimeDependencies {
		runtime: BlockMap,
		parents: BlockMap,
		libs: Set<string>
	}

	class Block {
		static setObjToHash(obj: object): void;
		static get(folder: string, file: string): Promise<Block>;
		static getComponentsLockPath(lockPrefix?: string): string;
		static getCacheFromPath(filepath: string): BlockMap;
		static getAll(names?: string[], opts?: {lockPrefix?: string}): Promise<BlockMap>;

		readonly name: string;
		readonly type: BlockFullType;
		readonly parent: string | null;
		readonly mixin: boolean;
		readonly dependencies: string[];
		readonly libs: string[];

		readonly logic: Promise<string | null>;
		readonly tpl: Promise<string | null>;
		readonly etpl: Promise<string | null>;
		readonly styles: Promise<string[]>;

		constructor(declaration: Declaration);

		getParent(): Promise<Block | null>;
		getParent({cache}: {cache?: BlockMap}): Promise<Block | null>;

		getDependencies(): Promise<BlockMap>;
		getDependencies({onlyOwn, cache}: {onlyOwn?: boolean; cache?: BlockMap}): Promise<BlockMap>;

		getLibs(): Promise<Set<string>>;
		getLibs({onlyOwn, cache}: {onlyOwn?: boolean; cache?: BlockMap}): Promise<Set<string>>;

		getRuntimeDependencies(): Promise<RuntimeDependencies>;
		getRuntimeDependencies({cache}: {cache?: BlockMap}): Promise<RuntimeDependencies>;
	}

	interface ProjectOptions {
		src: string;
		dir: string;
		serverDir: string;
		rootDir: string;
		config: typeof config;
	}

	interface DependencyProjectOptions extends ProjectOptions {
		exclude: Set<string>;
		libDir: string;
	}
}

export const helpers: {
	createSerializableMap<K, V = unknown>(data: [K, V][]): Map<K, V>;
	createSerializableSet<T>(data: T[]): Set<T>;
	jsonReviver(key: string, value: unknown): unknown;
}

export const config: {
	readonly super: string;
	readonly superRgxp: RegExp;
	readonly sourceDir: string;
	readonly blockDir: string;
	readonly serverDir: string;
	readonly entriesDir: string;
	readonly assets: Readonly<{dir: string; [key: string]: any}>;
	readonly projectType: 'ts' | 'js' | 'static';
	readonly projectName: string;
	readonly disclaimer: string | null;
	readonly dependencies: string[] | {src: string; exclude: string[]}[];
	readonly designSystem?: string;
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

	readonly depMap: Record<string, PzlrBuildCore.DependencyProjectOptions>;

	readonly sourceDir: string;
	readonly sourceDirs: string[];
	readonly dependencies: string[];
	readonly rootDependencies: string[];
	readonly serverDependencies: string[];
	readonly entryDependencies: string[];

	block(name?: string): Promise<string | null>;
	block(name: string, skip: number | string): Promise<{path: string; from: number} | null>;

	blockSync(name?: string): string | null;
	blockSync(name: string, skip: number | string): {path: string; from: number} | null;
	getLayerByPath(url: string): PzlrBuildCore.ProjectOptions | PzlrBuildCore.DependencyProjectOptions | undefined;

	entry(name?: string): string;

	isNodeModule(url: string): boolean;
};

export const
	block: PzlrBuildCore.Block;

interface Entry {
	readonly path: string;
	readonly source: string;
	readonly parent: string | undefined;
	readonly parents: Set<string>;
}

interface BuildConfig {
	entries: {
		[name: string]: Entry;
	};

	filter(cb: (el: Entry, key: string) => any): BuildConfig;

	getUnionEntryPoints({cache}: {cache?: PzlrBuildCore.BlockMap}): Promise<{
		dependencies: Record<string, Set<string>>;
		entry: Record<string, PzlrBuildCore.BlockMap>;
	}>;

	getRuntimeDependencies(): Promise<PzlrBuildCore.RuntimeDependencies>;
	getRuntimeDependencies({cache}: {cache?: PzlrBuildCore.BlockMap}): Promise<PzlrBuildCore.RuntimeDependencies>;
}

export const entries: {
	getCommonName(id: string | number): string;

	getBuildConfig(): Promise<BuildConfig>;
};
