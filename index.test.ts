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

import {strict as assert} from 'assert'
import tx,{$async, cd,   retryAsync} from "./index";
import path from "path";
import fs from "fs-extra";

describe("tx async", () => {
  test('Only stdout is used during command substitution', async () => {
    let hello = await $async`echo Error >&2; echo Hello`
    let len = +(await $async`echo ${hello} | wc -c`)
    assert(len === 6);
  });

  test('Env vars works', async () => {
    process.env.FOO = 'foo'
    let foo = await $async`echo $FOO`
    assert(foo.stdout === 'foo\n')
  });

  test('Env vars is safe to pass', async () => {
    process.env.FOO = 'hi; exit 1'
    await $async`echo $FOO`
  });

  test('Arguments are quoted', async () => {
    let bar = 'bar"";baz!$#^$\'&*~*%)({}||\\/'
    assert((await $async`echo ${bar}`).stdout.trim() === bar)
  });

  test('Undefined and empty string correctly quoted', async () => {
    $async`echo ${undefined}`
    $async`echo ${''}`
  });

  test('Can create a dir with a space in the name', async () => {
    let name = 'foo bar'
    try {
      await $async`mkdir /tmp/${name}`
    } finally {
      await fs.rmdir('/tmp/' + name)
    }
  });

  test('Pipefail is on', async () => {
    let p
    try {
      p = await $async`cat /dev/not_found | sort`
    } catch (e) {
      console.log('Caught an exception -> ok')
      p = e
    }
    assert(p.exitCode !== 0)
  });

  test('The __filename & __dirname are defined', async () => {
    console.log(__filename, __dirname)
  });

  test('The toString() is called on arguments', async () => {
    let foo = 0
    let p = await $async`echo ${foo}`
    assert(p.stdout === '0\n')
  });

  test('Can use array as an argument', async () => {
    try {
      let files = ['./index.ts', './tx.ts', './package.json']
      await $async`tar czf archive ${files}`
    } finally {
      await $async`rm archive`
    }
  });

  test('Pipes are working', async () => {
    let {stdout} = await $async`echo "hello"`
      .pipe($async`awk '{print $1" world"}'`)
      .pipe($async`tr '[a-z]' '[A-Z]'`)
    assert(stdout === 'HELLO WORLD\n')

    try {
      await $async`echo foo`
        .pipe(fs.createWriteStream('/tmp/output.txt'))
      assert((await fs.readFile('/tmp/output.txt')).toString() === 'foo\n')

      let r = $async`cat`
      fs.createReadStream('/tmp/output.txt')
        .pipe(r.stdin!)
      assert((await r).stdout === 'foo\n')
    } finally {
      await fs.rm('/tmp/output.txt')
    }
  });

  test('ProcessOutput thrown as error', async () => {
    let err
    try {
      await $async`wtf`
    } catch (p: any) {
      err = p
    }
    assert(err.exitCode > 0)
  });

  test('The pipe() throws if already resolved', async () => {
    let out, p = $async`echo "Hello"`
    await p
    try {
      out = await p.pipe($async`less`)
    } catch (err: any) {
      assert.equal(err.message, `The pipe() method shouldn't be called after promise is already resolved!`)
    }
    if (out) {
      assert.fail('Expected failure!')
    }
  });

  test('ProcessOutput::exitCode do not throw', async () => {
    assert(await $async`grep qwerty README.md`.exitCode !== 0)
    assert(await $async`[[ -f ${__filename} ]]`.exitCode === 0)
  });

  test('The nothrow() do not throw', async () => {
    let {exitCode} = await $async`exit 42`.nothrow();
    assert(exitCode === 42)
  });

  test('Executes a script from $PATH', async () => {
    const isWindows = process.platform === 'win32'
    const oldPath = process.env.PATH

    const envPathSeparator = isWindows ? ';' : ':'
    process.env.PATH += envPathSeparator + path.resolve('/tmp/')

    const toPOSIXPath = (_path: string) =>
      _path.split(path.sep).join(path.posix.sep)

    const binPath = path.resolve('./tx.ts')
    const binLocation = isWindows ? toPOSIXPath(binPath) : binPath
    const scriptCode = `#!/usr/bin/env ${binLocation}\nconsole.log('The script from path runs.')`

    try {
      await $async`echo ${scriptCode}`
        .pipe(fs.createWriteStream('/tmp/script-from-path', {mode: 0o744}))
      await $async`script-from-path`
    } finally {
      process.env.PATH = oldPath
      fs.rmSync('/tmp/script-from-path')
    }
  });

  test('The cd() works with relative paths', async () => {
    try {
      fs.mkdirpSync('/tmp/tx-cd-test/one/two')
      cd('/tmp/tx-cd-test/one/two')
      cd('..')
      cd('..')
      let pwd = (await $async`pwd`).stdout.trim()
      assert.equal(path.basename(pwd), 'tx-cd-test')
    } finally {
      fs.rmSync('/tmp/tx-cd-test', {recursive: true})
      cd(__dirname)
    }
  });

  test('The kill() method works', async () => {
    let p = $async`sleep 3`.nothrow();
    setTimeout(() => {
      p.kill()
    }, 100)
    await p
  });

  test('The signal is passed with kill() method', async () => {
    let p = $async`while true; do :; done`
    setTimeout(() => p.kill('SIGKILL'), 100)
    let signal
    try {
      await p
    } catch (p: any) {
      signal = p.signal
    }
    assert.equal(signal, 'SIGKILL')
  });

  test('Retry works', async () => {
    let exitCode = 0
    try {
      await retryAsync(5)`exit 123`
    } catch (p: any) {
      exitCode = p.exitCode
    }
    assert.equal(exitCode, 123)
  });

  let version
  test('require() is working in ESM', async () => {
    let data = require('./package.json')
    version = data.version
    assert.equal(data.name, 'tx')
  });
})