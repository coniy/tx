#!/usr/bin/env ts-node

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

import fs from 'fs-extra'
import {createRequire} from 'module'
import {tmpdir} from 'os'
import {basename, dirname, extname, join, resolve} from 'path'
import url from 'url'

import {fetch, ProcessOutput} from './index'
import chalk from "chalk";
import pkg from "./package.json";

(async () => {
  try {
    if (['--version', '-v', '-V'].includes(process.argv[2] || '')) {
      console.log(`tx version ${pkg.version}`)
      return process.exitCode = 0
    }
    let firstArg = process.argv.slice(2).find(a => !a.startsWith('--'))
    if (typeof firstArg === 'undefined' || firstArg === '-') {
      let ok = await scriptFromStdin()
      if (!ok) {
        printUsage()
        return process.exitCode = 2
      }
    } else if (firstArg.startsWith('http://') || firstArg.startsWith('https://')) {
      await scriptFromHttp(firstArg)
    } else {
      let filepath
      if (firstArg.startsWith('/')) {
        filepath = firstArg
      } else if (firstArg.startsWith('file:///')) {
        filepath = url.fileURLToPath(firstArg)
      } else {
        filepath = resolve(firstArg)
      }
      await importPath(filepath)
    }
    return process.exitCode = 0
  } catch (p) {
    if (p instanceof ProcessOutput) {
      console.error('Error: ' + p.message)
      return process.exitCode = 1
    } else {
      throw p
    }
  }
})()

async function scriptFromStdin() {
  let script = ''
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8')
    for await (const chunk of process.stdin) {
      script += chunk
    }

    if (script.length > 0) {
      let filepath = join(
        tmpdir(),
        Math.random().toString(36).substr(2) + '.ts'
      )
      await fs.mkdtemp(filepath)
      await writeAndImport(script, filepath, join(process.cwd(), 'stdin.ts'))
      return true
    }
  }
  return false
}

async function scriptFromHttp(remote: string) {
  let res = await fetch(remote)
  if (!res.ok) {
    console.error(`Error: Can't get ${remote}`)
    process.exit(1)
  }
  let script = await res.text()
  let filename = new URL(remote).pathname
  let filepath = join(tmpdir(), basename(filename))
  await fs.mkdtemp(filepath)
  await writeAndImport(script, filepath, join(process.cwd(), basename(filename)))
}

async function writeAndImport(script: string, filepath: string, origin = filepath) {
  await fs.writeFile(filepath, script)
  let wait = importPath(filepath, origin)
  await fs.rm(filepath)
  await wait
}

async function importPath(filepath: string, origin = filepath) {
  let ext = extname(filepath)

  if (ext === '') {
    let tmpFilename = fs.existsSync(`${filepath}.ts`) ?
      `${basename(filepath)}-${Math.random().toString(36).substr(2)}.ts` :
      `${basename(filepath)}.ts`

    return await writeAndImport(
      await fs.readFile(filepath, "utf8"),
      join(dirname(filepath), tmpFilename),
      origin,
    )
  }
  let __filename = resolve(origin)
  let __dirname = dirname(__filename)
  let require = createRequire(origin)
  Object.assign(global, {__filename, __dirname, require})
  await import(filepath)
}

function printUsage() {
  console.log(`
 ${chalk.bgGreenBright.black(' TX ')}
 Usage:
   tx [options] SCRIPT
 
 Options:
   --quiet            : don't echo commands
   --shell=<path>     : custom shell binary
   --prefix=<command> : prefix all commands
`)
}
