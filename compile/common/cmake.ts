
import { path } from '../../deps.ts';
import { exitError } from '../../util/exit.ts';
import { BuildType, PA, Platform, hostPA } from '../../util/target.ts';
import { exec } from '../../util/exec.ts';
import { exists } from '../../util/agnosticFS.ts';
import { kvf } from '../../util/cache.ts';


export async function require_cmake() {
	const tmp = kvf.get('cmake_bin');
	if (tmp) return tmp;
	const test = ['cmake'];
	for (let i = 0; i < test.length; i++) {
		if ((await exec('.', `${test[i]} --version`)).success) {
			kvf.set('cmake_bin', test[i]);
			return test[i];
		}
	}
}

export async function runCmake(o:{
	pre?:string[],
	//cmake direct args
	config_additional_args?:string[],
	//return false to use in another way the pass args
	filter?:(current:string, out:string[])=>boolean,
	//custom clear method
	clear?:(p:string)=>void,
	//args to be processed (filter by build type, origin, dest...)
	pass?:string[],
	//use old cmake input/output convetion?
	oldDirConv?:boolean,
	coverage_args?:string[],
	//to set defines
	pa?:PA
	preconfig?:(line:string[], bm:BuildType)=>void|Promise<void>,
	posconfig?:(dst:string, bm:BuildType)=>void|Promise<void>,
	//custom flag for release fast execution bin...
	release_fast_opt?:string,
	//custom flag for release low size bin...
	release_min_opt?:string,
}):Promise<Deno.ProcessStatus> {
	let cmake_program = '';
	if (o.pre == undefined) {
		const temp = await require_cmake();
		if (temp)
			cmake_program = temp;
		else
			throw exitError('[CMake] Cant found cmake.');
	}

	const pass:string[] = o.pass?o.pass:[];
	const a_args:string[] = [];
	if (o.config_additional_args)
		a_args.push(...o.config_additional_args);
	let a_src = '..';
	let a_dst = '.';
	let a_clear = false;
	let a_config = false;
	let a_build = false;
	let a_mode:BuildType = BuildType.DEBUG;
	let a_clangd = false;

	let i = 0;
	while (i < pass.length) {
		if (pass[i] == '\\r') {
			i++;
			break;
		}
		if (o.filter && !o.filter(pass[i],a_args)) {
			i++;continue;
		}
		if (pass[i].length> 2) {
			if (pass[i].startsWith('-B')) {
				a_dst = pass[i].substring(2);
				i++;continue;
			}
			if (pass[i].startsWith('-S')) {
				a_src = pass[i].substring(2);
				i++;continue;
			}
		}
		if (['.','..'].find((x)=>x==pass[i])!=null || ['.\\','./','..\\','../','"./','".\\','"../','"..\\'].find((x)=>pass[i].startsWith(x))!= null) {
			a_src = pass[i]
			i++;continue;
		}
		switch (pass[i].toLowerCase()) {
		case '-b':
			i++;
			a_dst = pass[i];
			break;
		case '-s':
			i++;
			a_src = pass[i];
			break;
		case 'cvg':
		case 'coverage':
		case 'debug-coverage':
			a_mode = BuildType.DEBUG_COVERAGE;break;
		case 'dbg':
		case 'debug':a_mode = BuildType.DEBUG;break;
		case 'rel':
		case 'release':
		case 'release-fast':
			a_mode = BuildType.RELEASE_FAST;break;
		case 'release-min':
		case 'release-size':
			a_mode = BuildType.RELEASE_MIN;break;
		case 'reconf':
		case 'reconfig':
		case 'reconfigure':
		case 'regen':// deno-lint-ignore no-fallthrough
		case 'regenerate':
			a_clear = true;
		case 'conf':
		case 'config':
		case 'configure':
		case 'gen':
		case 'generate':
			a_config = true;break;
		case 'clear':
			a_clear = true;break;
		case 'build':a_build = true;break;
		case 'rebuild':
			a_clear = true;
			a_config = true;
			a_build = true;
			break;
		case 'rerel':
		case 'rerelease':
			a_clear = true;
			a_config = true;
			a_build = true;
			a_mode = BuildType.RELEASE_FAST;break;
		case 'redbg':
		case 'redebug':
			a_clear = true;
			a_config = true;
			a_build = true;
			a_mode = BuildType.DEBUG;break;
		case 'recvg':
		case 'recoverage':
			a_clear = true;
			a_config = true;
			a_build = true;
			a_mode = BuildType.DEBUG_COVERAGE;break;
		case 'clangd':
			a_config = true;
			a_clangd = true;break;
		default:
			a_args.push(pass[i]);
		}
		i++;
	}
	if (o.coverage_args && o.coverage_args.length == 0)
		console.log('%c[!] Coverage unsuported for this target.', 'color: yellow;')

	a_src = a_src.replaceAll('"','');
	a_dst = a_dst.replaceAll('"','');
	if (!a_config &&((!a_clear && !a_build) || (
		a_build && !exists(path.resolve(a_dst,'CMakeCache.txt'))
	))){
		a_config = true;
	}
	if (a_clear) {
		if (o.clear) o.clear(a_dst);
		else {
			//....clear to be implemented
		}
	}
	if (a_config) {
		const line:string[] = [];
		if (o.pre) line.push(...o.pre);
		else line.push(cmake_program);
		if (a_clangd) {
			while (true) {
				const i = a_args.findIndex((x)=>x=='-A'||x=='-G');
				if (i>= 0) a_args.splice(i, 2);
				else break;
			}
			line.push('-G', (hostPA.platform != Platform.WINDOWS)?'Unix Makefiles':'Ninja','-DCMAKE_EXPORT_COMPILE_COMMANDS=ON');
		}
		if (o.pa) {
			line.push(
				`-DCCT_TARGET=${o.pa.platform}-${o.pa.arch}`,
				`-DCCT_TARGET_PLATFORM=${o.pa.platform}`,
				`-DCCT_TARGET_ARCH=${o.pa.arch}`,
			);
		}
		switch (a_mode) {
		case BuildType.DEBUG_COVERAGE:
			line.push('-DCMAKE_BUILD_TYPE=Debug');
			if (o.coverage_args)
				line.push(...o.coverage_args);
			else
				line.push(
					'-DCMAKE_CXX_FLAGS_DEBUG="-fprofile-instr-generate -fcoverage-mapping"',
					'-DCMAKE_C_FLAGS_DEBUG="-fprofile-instr-generate -fcoverage-mapping"'
				)
			break;
		case BuildType.DEBUG:
			line.push('-DCMAKE_BUILD_TYPE=Debug');break;
		case BuildType.RELEASE_FAST:
			line.push(
				'-DCMAKE_BUILD_TYPE=Release',
				'-DCMAKE_CXX_FLAGS_RELEASE='+(o.release_fast_opt?o.release_fast_opt:'-Ofast'),
				'-DCMAKE_C_FLAGS_RELEASE='+(o.release_fast_opt?o.release_fast_opt:'-Ofast')
			);break;
		case BuildType.RELEASE_MIN:
			line.push(
				'-DCMAKE_BUILD_TYPE=Release',
				'-DCMAKE_CXX_FLAGS_RELEASE='+(o.release_min_opt?o.release_min_opt:'-Os'),
				'-DCMAKE_C_FLAGS_RELEASE='+(o.release_min_opt?o.release_min_opt:'-Os')
			);break;
		}
		line.push(...a_args);

		if (o.oldDirConv)
			line.push(a_src);
		else
			line.push('-B',a_dst,'-S',a_src);

		if (o.preconfig) {
			const res = o.preconfig(line, a_mode);
			if (res) await res;
		}

		const res = await exec(a_dst, fuseDefines(line), {pipeInput:true, pipeOutput:true});
		if (!res.success)
			return res;
		if (o.posconfig) {
			const res = o.posconfig(a_dst, a_mode);
			if (res) await res;
		}
		if (a_clangd)
			Deno.rename(path.resolve(a_dst, 'compile_commands.json'), 'compile_commands.json');
	}
	if (a_build) {
		if (a_clangd)
			throw "cant build with clangd as target";
		const line:string[] = [];
		if (o.pre) line.push(...o.pre);
		else line.push(cmake_program);
		line.push('--build', '.', '--config',
			(
				a_mode == BuildType.DEBUG ||
				a_mode == BuildType.DEBUG_COVERAGE
			)?'Debug':'Release'
		);
		const res = await exec(a_dst, line, {pipeInput:true, pipeOutput:true});
		if (!res.success)
			return res;
	}
	return {success:true, code:0};
}

export function fuseDefines(args:string[]):string[] {
	const defs = new Map<string,string>();

	return [
		...args.filter((arg)=>{
			if (!arg.startsWith('-D'))
				return true;
			const i = arg.indexOf('=');
			if (i < 0) {
				const key = arg.substring(2);
				if (!defs.has(key))
					defs.set(key, "");
				return false;
			}
			const key = arg.substring(2, i);
			let value = arg.substring(i+1);
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
				value = value.substring(1, value.length-1);
			if (defs.has(key)) {
				if (value != "") {
					const tv = defs.get(key);
					defs.set(key, tv==""?value:(tv+' '+value));
				}
			} else
				defs.set(key, value);
			return false;
		}),
		...Array.from(defs.keys()).map((key)=>{
			return `-D${key}=${defs.get(key) as string}`;
		})
	];
}
export function cmakeFlagFromBuildType(x:BuildType) {
	switch (x) {
	case BuildType.DEBUG: return 'debug';
	case BuildType.DEBUG_COVERAGE: return 'debug-coverage';
	case BuildType.RELEASE_FAST: return 'release-fast';
	case BuildType.RELEASE_MIN: return 'release-min';
	}
	return '';
}