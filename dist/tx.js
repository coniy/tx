#!/usr/bin/env ts-node
"use strict";
// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = __importDefault(require("fs-extra"));
const module_1 = require("module");
const os_1 = require("os");
const path_1 = require("path");
const url_1 = __importDefault(require("url"));
const index_1 = require("./index");
const chalk_1 = __importDefault(require("chalk"));
const package_json_1 = __importDefault(require("./package.json"));
(async () => {
    try {
        if (['--version', '-v', '-V'].includes(process.argv[2] || '')) {
            console.log(`tx version ${package_json_1.default.version}`);
            return process.exitCode = 0;
        }
        let firstArg = process.argv.slice(2).find(a => !a.startsWith('--'));
        if (typeof firstArg === 'undefined' || firstArg === '-') {
            let ok = await scriptFromStdin();
            if (!ok) {
                printUsage();
                return process.exitCode = 2;
            }
        }
        else if (firstArg.startsWith('http://') || firstArg.startsWith('https://')) {
            await scriptFromHttp(firstArg);
        }
        else {
            let filepath;
            if (firstArg.startsWith('/')) {
                filepath = firstArg;
            }
            else if (firstArg.startsWith('file:///')) {
                filepath = url_1.default.fileURLToPath(firstArg);
            }
            else {
                filepath = (0, path_1.resolve)(firstArg);
            }
            await importPath(filepath);
        }
        return process.exitCode = 0;
    }
    catch (p) {
        if (p instanceof index_1.ProcessOutput) {
            console.error('Error: ' + p.message);
            return process.exitCode = 1;
        }
        else {
            throw p;
        }
    }
})();
async function scriptFromStdin() {
    let script = '';
    if (!process.stdin.isTTY) {
        process.stdin.setEncoding('utf8');
        for await (const chunk of process.stdin) {
            script += chunk;
        }
        if (script.length > 0) {
            let filepath = (0, path_1.join)((0, os_1.tmpdir)(), Math.random().toString(36).substr(2) + '.ts');
            await fs_extra_1.default.mkdtemp(filepath);
            await writeAndImport(script, filepath, (0, path_1.join)(process.cwd(), 'stdin.ts'));
            return true;
        }
    }
    return false;
}
async function scriptFromHttp(remote) {
    let res = await (0, index_1.fetch)(remote);
    if (!res.ok) {
        console.error(`Error: Can't get ${remote}`);
        process.exit(1);
    }
    let script = await res.text();
    let filename = new URL(remote).pathname;
    let filepath = (0, path_1.join)((0, os_1.tmpdir)(), (0, path_1.basename)(filename));
    await fs_extra_1.default.mkdtemp(filepath);
    await writeAndImport(script, filepath, (0, path_1.join)(process.cwd(), (0, path_1.basename)(filename)));
}
async function writeAndImport(script, filepath, origin = filepath) {
    await fs_extra_1.default.writeFile(filepath, script);
    let wait = importPath(filepath, origin);
    await fs_extra_1.default.rm(filepath);
    await wait;
}
async function importPath(filepath, origin = filepath) {
    let ext = (0, path_1.extname)(filepath);
    if (ext === '') {
        let tmpFilename = fs_extra_1.default.existsSync(`${filepath}.ts`) ?
            `${(0, path_1.basename)(filepath)}-${Math.random().toString(36).substr(2)}.ts` :
            `${(0, path_1.basename)(filepath)}.ts`;
        return await writeAndImport(await fs_extra_1.default.readFile(filepath, "utf8"), (0, path_1.join)((0, path_1.dirname)(filepath), tmpFilename), origin);
    }
    let __filename = (0, path_1.resolve)(origin);
    let __dirname = (0, path_1.dirname)(__filename);
    let require = (0, module_1.createRequire)(origin);
    Object.assign(global, { __filename, __dirname, require });
    await Promise.resolve().then(() => __importStar(require(filepath)));
}
function printUsage() {
    console.log(`
 ${chalk_1.default.bgGreenBright.black(' TX ')}
 Usage:
   tx [options] SCRIPT
 
 Options:
   --quiet            : don't echo commands
   --shell=<path>     : custom shell binary
   --prefix=<command> : prefix all commands
`);
}
//# sourceMappingURL=tx.js.map