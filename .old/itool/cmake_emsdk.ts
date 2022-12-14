import { TCommand, TFactory } from "../base/interfaces.ts";
import { Arch, BuildType, hostPA, PA, Platform } from "../base/target.ts";
import { runCmake } from "../irequirement/auxi/cmake_parse.ts";
import * as afs from '../base/agnosticFS.ts';
import { Language, minify } from "https://deno.land/x/minifier@v1.1.1/mod.ts";
import { extname } from "https://deno.land/std@0.129.0/path/win32.ts";
import { writeIfDiff } from "../base/utils.ts";

export const D:TFactory = (pa:PA) =>{
	const r = new Map<string, TCommand>();
	r.set("cmake",  async (pass:string[], i:number)=>{
		const cflags = '-Wall -Wextra';
		const use:string[] = [];
		if (pa.arch == Arch.JAVASCRIPT)
			use.push('-s ASM_JS=1');

		const extrargs:string[] = [
			`-DCMAKE_CXX_FLAGS="${[cflags, ...use].join(' ')}"`,
			`-DCMAKE_C_FLAGS="${[cflags, ...use].join(' ')}"`,
			`-DCMAKE_EXECUTABLE_SUFFIX=.html`

		];
		if (use.length > 0)
			extrargs.push(`-DCMAKE_EXE_LINKER_FLAGS="${use.join(' ')}"`);
		
		return await runCmake({
			pre:[
				(hostPA.platform == Platform.WINDOWS)?
				'emcmake.bat':'emcmake',
				'cmake'
			],
			i, pass, pa,
			config_additional_args:extrargs,
			preconfig:(line:string[], bm:BuildType)=>{
				if (bm == BuildType.DEBUG) {
					if (pa.arch == Arch.JAVASCRIPT)
						line.push('-DCMAKE_CXX_FLAGS="-fexceptions"', '-DCMAKE_C_FLAGS="-fexceptions"', '-DCMAKE_EXE_LINKER_FLAGS="-fexceptions"');
					else
						line.push('-DCMAKE_CXX_FLAGS="-fwasm-exceptions"', '-DCMAKE_C_FLAGS="-fwasm-exceptions"', '-DCMAKE_EXE_LINKER_FLAGS="-fwasm-exceptions"');
				}
			},
			posconfig:(dst:string, bm:BuildType)=>{
				if (bm == BuildType.RELEASE_FAST || bm == BuildType.RELEASE_MIN)
					uglifyJS(dst);
			}
		});
	});
	return r;
};
function uglifyJS (path:string) {
	afs.search(path, (path:string, isFile:boolean)=>{
		if (isFile && extname(path) == '.js')
			writeIfDiff(path, minify(Language.JS, afs.readTextFile(path)));
		return true;
	});
}