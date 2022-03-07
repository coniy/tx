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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const index_1 = require("./index");
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
describe("tx async", () => {
    test('Only stdout is used during command substitution', async () => {
        let hello = await (0, index_1.$async) `echo Error >&2; echo Hello`;
        let len = +(await (0, index_1.$async) `echo ${hello} | wc -c`);
        (0, assert_1.strict)(len === 6);
    });
    test('Env vars works', async () => {
        process.env.FOO = 'foo';
        let foo = await (0, index_1.$async) `echo $FOO`;
        (0, assert_1.strict)(foo.stdout === 'foo\n');
    });
    test('Env vars is safe to pass', async () => {
        process.env.FOO = 'hi; exit 1';
        await (0, index_1.$async) `echo $FOO`;
    });
    test('Arguments are quoted', async () => {
        let bar = 'bar"";baz!$#^$\'&*~*%)({}||\\/';
        (0, assert_1.strict)((await (0, index_1.$async) `echo ${bar}`).stdout.trim() === bar);
    });
    test('Undefined and empty string correctly quoted', async () => {
        (0, index_1.$async) `echo ${undefined}`;
        (0, index_1.$async) `echo ${''}`;
    });
    test('Can create a dir with a space in the name', async () => {
        let name = 'foo bar';
        try {
            await (0, index_1.$async) `mkdir /tmp/${name}`;
        }
        finally {
            await fs_extra_1.default.rmdir('/tmp/' + name);
        }
    });
    test('Pipefail is on', async () => {
        let p;
        try {
            p = await (0, index_1.$async) `cat /dev/not_found | sort`;
        }
        catch (e) {
            console.log('Caught an exception -> ok');
            p = e;
        }
        (0, assert_1.strict)(p.exitCode !== 0);
    });
    test('The __filename & __dirname are defined', async () => {
        console.log(__filename, __dirname);
    });
    test('The toString() is called on arguments', async () => {
        let foo = 0;
        let p = await (0, index_1.$async) `echo ${foo}`;
        (0, assert_1.strict)(p.stdout === '0\n');
    });
    test('Can use array as an argument', async () => {
        try {
            let files = ['./index.ts', './tx.ts', './package.json'];
            await (0, index_1.$async) `tar czf archive ${files}`;
        }
        finally {
            await (0, index_1.$async) `rm archive`;
        }
    });
    test('Pipes are working', async () => {
        let { stdout } = await (0, index_1.$async) `echo "hello"`
            .pipe((0, index_1.$async) `awk '{print $1" world"}'`)
            .pipe((0, index_1.$async) `tr '[a-z]' '[A-Z]'`);
        (0, assert_1.strict)(stdout === 'HELLO WORLD\n');
        try {
            await (0, index_1.$async) `echo foo`
                .pipe(fs_extra_1.default.createWriteStream('/tmp/output.txt'));
            (0, assert_1.strict)((await fs_extra_1.default.readFile('/tmp/output.txt')).toString() === 'foo\n');
            let r = (0, index_1.$async) `cat`;
            fs_extra_1.default.createReadStream('/tmp/output.txt')
                .pipe(r.stdin);
            (0, assert_1.strict)((await r).stdout === 'foo\n');
        }
        finally {
            await fs_extra_1.default.rm('/tmp/output.txt');
        }
    });
    test('ProcessOutput thrown as error', async () => {
        let err;
        try {
            await (0, index_1.$async) `wtf`;
        }
        catch (p) {
            err = p;
        }
        (0, assert_1.strict)(err.exitCode > 0);
    });
    test('The pipe() throws if already resolved', async () => {
        let out, p = (0, index_1.$async) `echo "Hello"`;
        await p;
        try {
            out = await p.pipe((0, index_1.$async) `less`);
        }
        catch (err) {
            assert_1.strict.equal(err.message, `The pipe() method shouldn't be called after promise is already resolved!`);
        }
        if (out) {
            assert_1.strict.fail('Expected failure!');
        }
    });
    test('ProcessOutput::exitCode do not throw', async () => {
        (0, assert_1.strict)(await (0, index_1.$async) `grep qwerty README.md`.exitCode !== 0);
        (0, assert_1.strict)(await (0, index_1.$async) `[[ -f ${__filename} ]]`.exitCode === 0);
    });
    test('The nothrow() do not throw', async () => {
        let { exitCode } = await (0, index_1.$async) `exit 42`.nothrow();
        (0, assert_1.strict)(exitCode === 42);
    });
    test('Executes a script from $PATH', async () => {
        const isWindows = process.platform === 'win32';
        const oldPath = process.env.PATH;
        const envPathSeparator = isWindows ? ';' : ':';
        process.env.PATH += envPathSeparator + path_1.default.resolve('/tmp/');
        const toPOSIXPath = (_path) => _path.split(path_1.default.sep).join(path_1.default.posix.sep);
        const binPath = path_1.default.resolve('./tx.ts');
        const binLocation = isWindows ? toPOSIXPath(binPath) : binPath;
        const scriptCode = `#!/usr/bin/env ${binLocation}\nconsole.log('The script from path runs.')`;
        try {
            await (0, index_1.$async) `echo ${scriptCode}`
                .pipe(fs_extra_1.default.createWriteStream('/tmp/script-from-path', { mode: 0o744 }));
            await (0, index_1.$async) `script-from-path`;
        }
        finally {
            process.env.PATH = oldPath;
            fs_extra_1.default.rmSync('/tmp/script-from-path');
        }
    });
    test('The cd() works with relative paths', async () => {
        try {
            fs_extra_1.default.mkdirpSync('/tmp/tx-cd-test/one/two');
            (0, index_1.cd)('/tmp/tx-cd-test/one/two');
            (0, index_1.cd)('..');
            (0, index_1.cd)('..');
            let pwd = (await (0, index_1.$async) `pwd`).stdout.trim();
            assert_1.strict.equal(path_1.default.basename(pwd), 'tx-cd-test');
        }
        finally {
            fs_extra_1.default.rmSync('/tmp/tx-cd-test', { recursive: true });
            (0, index_1.cd)(__dirname);
        }
    });
    test('The kill() method works', async () => {
        let p = (0, index_1.$async) `sleep 3`.nothrow();
        setTimeout(() => {
            p.kill();
        }, 100);
        await p;
    });
    test('The signal is passed with kill() method', async () => {
        let p = (0, index_1.$async) `while true; do :; done`;
        setTimeout(() => p.kill('SIGKILL'), 100);
        let signal;
        try {
            await p;
        }
        catch (p) {
            signal = p.signal;
        }
        assert_1.strict.equal(signal, 'SIGKILL');
    });
    test('Retry works', async () => {
        let exitCode = 0;
        try {
            await (0, index_1.retryAsync)(5) `exit 123`;
        }
        catch (p) {
            exitCode = p.exitCode;
        }
        assert_1.strict.equal(exitCode, 123);
    });
    let version;
    test('require() is working in ESM', async () => {
        let data = require('./package.json');
        version = data.version;
        assert_1.strict.equal(data.name, 'tx');
    });
});
//# sourceMappingURL=index.test.js.map