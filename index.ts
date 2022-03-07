import {ChildProcess, spawn, spawnSync} from "child_process";
import which from 'which';
import {promisify} from "util";
import chalk from "chalk";
import psTreeModule from 'ps-tree'
import {Readable, Writable} from "stream";
import nodeFetch, {RequestInit} from 'node-fetch';

let tx = {
  verbose: true,
  shell: "",
  prefix: "",
}

export default tx;

if (!tx.shell) {
  try {
    tx.shell = which.sync("bash");
    tx.prefix = "set -euo pipefail;";
  } catch (e) {
    console.log("bash not found");
  }
}

const psTree = promisify(psTreeModule)

export function $(template: TemplateStringsArray, ...args: any[]): string {
  let __from = (new Error().stack!.split(/^\s*at\s/m)[2]).trim()
  let cmd = template[0], i = 0
  while (i < args.length) {
    let s
    if (Array.isArray(args[i])) {
      s = args[i].map((x: any) => quote(trimEndLine(x))).join(' ')
    } else {
      s = quote(substitute(args[i]))
    }
    cmd += s + template[++i]
  }
  if (tx.verbose) {
    printCmd(cmd)
  }
  let ret = spawnSync(tx.prefix + cmd, {
    cwd: process.cwd(),
    shell: tx.shell ?? true,
    env: process.env,
    stdio: "pipe",
    windowsHide: true,
    maxBuffer: 200 * 1024 * 1024, // 200 MiB
    encoding: "utf8",
  })
  if (tx.verbose) {
    process.stdout.write(ret.stdout);
    process.stderr.write(ret.stderr);
  }
  let code = ret.status ?? 0;
  let message = `${ret.stderr || '\n'}    at ${__from}`
  message += `\n    exit code: ${code}${exitCodeInfo(code) ? ' (' + exitCodeInfo(code) + ')' : ''}`
  if (ret.signal !== null) {
    message += `\n    signal: ${ret.signal}`
  }
  if (code !== 0) {
    throw new ProcessOutput({
      exitCode: code,
      stdout: ret.stdout,
      stderr: ret.stderr,
      message: message,
    });
  }
  return ret.stdout;
}

export function $async(pieces: TemplateStringsArray, ...args: any[]): ProcessPromise {
  let __from = (new Error().stack!.split(/^\s*at\s/m)[2]).trim()

  let cmd = pieces[0], i = 0
  while (i < args.length) {
    let s
    if (Array.isArray(args[i])) {
      s = args[i].map((x: any) => quote(substitute(x))).join(' ')
    } else {
      s = quote(substitute(args[i]))
    }
    cmd += s + pieces[++i]
  }

  let resolve: any, reject: any
  let promise = new InternalProcessPromise((...args) => [resolve, reject] = args)

  promise._run = () => {
    if (promise.child) return; // The _run() called from two places: then() and setTimeout().
    if (promise._prerun) promise._prerun() // In case $1.pipe($2), the $2 returned, and on $2._run() invoke $1._run().
    if (tx.verbose && !promise._quiet) {
      printCmd(cmd)
    }

    let child = spawn(tx.prefix + cmd, {
      cwd: process.cwd(),
      shell: tx.shell ?? true,
      env: process.env,
      stdio: [promise._inheritStdin ? 'inherit' : 'pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    child.on('close', (code, signal) => {
      let exitCode = code ?? 0;
      let message = `${stderr || '\n'}    at ${__from}`
      message += `\n    exit code: ${code}${exitCodeInfo(exitCode) ? ' (' + exitCodeInfo(exitCode) + ')' : ''}`
      if (signal !== null) {
        message += `\n    signal: ${signal}`
      }
      let output = new ProcessOutput({
        exitCode,
        signal,
        stdout,
        stderr,
        combined,
        message,
      });
      (code === 0 || promise._nothrow ? resolve : reject)(output)
      promise._resolved = true
    })

    let stdout = '', stderr = '', combined = ''
    if (!promise._piped) {
      // If process is piped, don't collect or print output.
      child.stdout!.on('data', data => {
        if (tx.verbose && !promise._quiet) process.stdout.write(data)
        stdout += data
        combined += data
      })
    }
    child.stderr!.on('data', data => {
      // Stderr should be printed regardless of piping.
      if (tx.verbose && !promise._quiet) process.stderr.write(data)
      stderr += data
      combined += data
    })
    promise.child = child
    if (promise._postrun) promise._postrun() // In case $1.pipe($2), after both subprocesses are running, we can pipe $1.stdout to $2.stdin.
  }
  setTimeout(promise._run, 0) // Make sure all subprocesses are started, if not explicitly by await or then().
  return promise
}

export interface ProcessPromise extends Promise<any> {
  get stdin(): Writable|null

  get stdout(): Readable|null

  get stderr(): Readable|null

  get exitCode(): Promise<number>

  then<R1 = any, R2 = any>(onfulfilled?: ((value: any) => R1|PromiseLike<R1>)|undefined|null, onrejected?: ((reason: any) => R2|PromiseLike<R2>)|undefined|null): Promise<R1|R2>

  pipe(dest: ProcessPromise|NodeJS.WritableStream): ProcessPromise

  kill(signal?: string): void

  nothrow(): ProcessPromise

  quiet(): ProcessPromise
}

class InternalProcessPromise extends Promise<any> {
  child: ChildProcess|undefined
  _nothrow = false
  _quiet = false
  _resolved = false
  _inheritStdin = true
  _piped = false
  _prerun: (() => void)|undefined = undefined
  _run: (() => void)|undefined = undefined
  _postrun: (() => void)|undefined = undefined

  get stdin() {
    this._inheritStdin = false
    this._run?.()
    return this.child!.stdin
  }

  get stdout() {
    this._inheritStdin = false
    this._run?.()
    return this.child!.stdout
  }

  get stderr() {
    this._inheritStdin = false
    this._run?.()
    return this.child!.stderr
  }

  get exitCode(): Promise<number> {
    return this
      .then(p => p.exitCode)
      .catch(p => p.exitCode)
  }

  then<R1 = any, R2 = any>(onfulfilled?: ((value: any) => R1|PromiseLike<R1>)|undefined|null, onrejected?: ((reason: any) => R2|PromiseLike<R2>)|undefined|null): Promise<R1|R2> {
    if (this._run) this._run()
    return super.then(onfulfilled, onrejected)
  }

  pipe(dest: this|NodeJS.WritableStream): this {
    if (this._resolved) {
      if (dest instanceof InternalProcessPromise) {
        dest.kill()
      }
      throw new Error('The pipe() method shouldn\'t be called after promise is already resolved!')
    }
    this._piped = true

    if (dest instanceof InternalProcessPromise) {
      dest._inheritStdin = false
      dest._prerun = this._run
      dest._postrun = () => this.stdout!.pipe(dest.child!.stdin!)
      return dest
    } else {
      this._postrun = () => this.stdout!.pipe(dest)
      return this
    }
  }

  async kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.catch(_ => _)
    let children = await psTree(this.child!.pid!)
    for (const p of children) {
      try {
        process.kill(Number(p.PID), signal)
      } catch (e) {
      }
    }
    try {
      process.kill(this.child!.pid!, signal)
    } catch (e) {
    }
  }

  nothrow(): this {
    this._nothrow = true
    return this
  }

  quiet(): this {
    this._quiet = true
    return this
  }
}

export class ProcessOutput extends Error {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly combined: string
  readonly signal: NodeJS.Signals|null

  constructor(option: Partial<ProcessOutput>) {
    super(option.message)
    this.exitCode = option.exitCode ?? 0
    this.stdout = option.stdout ?? ""
    this.stderr = option.stderr ?? ""
    this.combined = option.combined ?? this.stdout + this.stderr;
    this.signal = option.signal ?? null
  }

  toString() {
    return this.combined
  }
}

function printCmd(cmd: string) {
  if (/\n/.test(cmd)) {
    console.log(cmd
      .split('\n')
      .map((line, i) => (i === 0 ? '$' : '>') + ' ' + colorize(line))
      .join('\n'))
  } else {
    console.log('$', colorize(cmd))
  }
}

function colorize(cmd: string) {
  return cmd.replace(/^[\w_.-]+(\s|$)/, substr => {
    return chalk.greenBright(substr)
  })
}

function substitute(arg: any): string {
  if (arg instanceof ProcessOutput) {
    return arg.stdout.replace(/\n$/, '')
  }
  return `${arg}`
}

function trimEndLine(s: any): string {
  return s.replace(/\n$/, '')
}

export function quote(arg: string): string {
  if (/^[a-z0-9/_.-]+$/i.test(arg) || arg === '') {
    return arg
  }
  return `$'`
    + arg
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/\f/g, '\\f')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/\v/g, '\\v')
      .replace(/\0/g, '\\0')
    + `'`
}

function exitCodeInfo(exitCode: number): string|undefined {
  return {
    2: 'Misuse of shell builtins',
    126: 'Invoked command cannot execute',
    127: 'Command not found',
    128: 'Invalid exit argument',
    129: 'Hangup',
    130: 'Interrupt',
    131: 'Quit and dump core',
    132: 'Illegal instruction',
    133: 'Trace/breakpoint trap',
    134: 'Process aborted',
    135: 'Bus error: "access to undefined portion of memory object"',
    136: 'Floating point exception: "erroneous arithmetic operation"',
    137: 'Kill (terminate immediately)',
    138: 'User-defined 1',
    139: 'Segmentation violation',
    140: 'User-defined 2',
    141: 'Write to pipe with no one reading',
    142: 'Signal raised by alarm',
    143: 'Termination (request to terminate)',
    145: 'Child process terminated, stopped (or continued*)',
    146: 'Continue if stopped',
    147: 'Stop executing temporarily',
    148: 'Terminal stop signal',
    149: 'Background process attempting to read from tty ("in")',
    150: 'Background process attempting to write to tty ("out")',
    151: 'Urgent data available on socket',
    152: 'CPU time limit exceeded',
    153: 'File size limit exceeded',
    154: 'Signal raised by timer counting virtual time: "virtual timer expired"',
    155: 'Profiling timer expired',
    157: 'Pollable event',
    159: 'Bad syscall',
  }[exitCode]
}

export async function fetch(url: string, init?: RequestInit) {
  if (tx.verbose) {
    if (typeof init !== 'undefined') {
      console.log('$', colorize(`fetch ${url}`), init)
    } else {
      console.log('$', colorize(`fetch ${url}`))
    }
  }
  return nodeFetch(url, init)
}

export function cd(path: string) {
  if (tx.verbose) console.log('$', colorize(`cd ${path}`))
  process.chdir(path)
}

export function cdAsync(path: string) {
  return promisify(cd)(path)
}

export function sleep(second: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, second * 1000)
}

export function sleepAsync(second: number) {
  return promisify(resolve => setTimeout(resolve, second * 1000))
}

// Retries a command a few times. Will return after the first
// successful attempt, or will throw after specifies attempts count.
export const retryAsync = (count = 5) => async (template: TemplateStringsArray, ...args: any[]) => {
  while (count-- > 0) {
    try {
      return await $async(template, ...args)
    } catch (p) {
      if (count === 0) throw p
    }
  }
}