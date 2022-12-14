import { TCommand, TFactory } from "../base/interfaces.ts";
import { PA, archUtil, Platform } from "../base/target.ts";
import { runCmake } from "../irequirement/auxi/cmake_parse.ts";
import { replaceRuntimeProjects } from "../irequirement/auxi/vcpp_runtime.ts";
import { vcpp } from "../irequirement/vcpp.ts";

export const D:TFactory = (pa:PA) =>{
	const r = new Map<string, TCommand>();
	r.set("cmake",  async (args:string[], i:number)=>{
		const config = await vcpp.require();
		const extrargs:string[] = ['-A', archUtil.toMicrosoft(pa.arch)];
		if (pa.platform == Platform.UWP)
			extrargs.push('-DCMAKE_SYSTEM_NAME=WindowsStore','-DCMAKE_SYSTEM_VERSION='+ config.uwpVersion);
		return await runCmake({
			i:i,
			pass:args,
			pa,
			config_additional_args:extrargs,
			posconfig:(dst)=>replaceRuntimeProjects(
				dst,
				(pa.platform == Platform.UWP)?
				config.uwpRuntime:
				config.winRuntime
			),
			release_fast_opt:'Ot',
			release_min_opt:'Os'
		});
	});
	return r;
};