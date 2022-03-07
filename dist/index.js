"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAsync = exports.sleepAsync = exports.sleep = exports.cdAsync = exports.cd = exports.fetch = exports.quote = exports.ProcessOutput = exports.$async = exports.$ = void 0;
const child_process_1 = require("child_process");
const which_1 = __importDefault(require("which"));
const util_1 = require("util");
const chalk_1 = __importDefault(require("chalk"));
const ps_tree_1 = __importDefault(require("ps-tree"));
const node_fetch_1 = __importDefault(require("node-fetch"));
let tx = {
    verbose: true,
    shell: "",
    prefix: "",
};
exports.default = tx;
if (!tx.shell) {
    try {
        tx.shell = which_1.default.sync("bash");
        tx.prefix = "set -euo pipefail;";
    }
    catch (e) {
        console.log("bash not found");
    }
}
const psTree = (0, util_1.promisify)(ps_tree_1.default);
function $(template, ...args) {
    let __from = (new Error().stack.split(/^\s*at\s/m)[2]).trim();
    let cmd = template[0], i = 0;
    while (i < args.length) {
        let s;
        if (Array.isArray(args[i])) {
            s = args[i].map((x) => quote(trimEndLine(x))).join(' ');
        }
        else {
            s = quote(substitute(args[i]));
        }
        cmd += s + template[++i];
    }
    let ret = (0, child_process_1.spawnSync)(tx.prefix + cmd, {
        cwd: process.cwd(),
        shell: tx.shell ?? true,
        env: process.env,
        stdio: ["inherit", "pipe", "pipe"],
        windowsHide: true,
        maxBuffer: 200 * 1024 * 1024,
        encoding: "utf8",
    });
    let code = ret.status ?? 0;
    let message = `${ret.stderr || '\n'}    at ${__from}`;
    message += `\n    exit code: ${code}${exitCodeInfo(code) ? ' (' + exitCodeInfo(code) + ')' : ''}`;
    if (ret.signal !== null) {
        message += `\n    signal: ${ret.signal}`;
    }
    let output = new ProcessOutput({
        exitCode: code,
        stdout: ret.stdout,
        stderr: ret.stderr,
        message: message,
    });
    if (output.exitCode !== 0) {
        throw output;
    }
    return output;
}
exports.$ = $;
function $async(pieces, ...args) {
    let __from = (new Error().stack.split(/^\s*at\s/m)[2]).trim();
    let cmd = pieces[0], i = 0;
    while (i < args.length) {
        let s;
        if (Array.isArray(args[i])) {
            s = args[i].map((x) => quote(substitute(x))).join(' ');
        }
        else {
            s = quote(substitute(args[i]));
        }
        cmd += s + pieces[++i];
    }
    let resolve, reject;
    let promise = new InternalProcessPromise((...args) => [resolve, reject] = args);
    promise._run = () => {
        if (promise.child)
            return; // The _run() called from two places: then() and setTimeout().
        if (promise._prerun)
            promise._prerun(); // In case $1.pipe($2), the $2 returned, and on $2._run() invoke $1._run().
        if (tx.verbose && !promise._quiet) {
            printCmd(cmd);
        }
        let child = (0, child_process_1.spawn)(tx.prefix + cmd, {
            cwd: process.cwd(),
            shell: tx.shell ?? true,
            env: process.env,
            stdio: [promise._inheritStdin ? 'inherit' : 'pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        child.on('close', (code, signal) => {
            let exitCode = code ?? 0;
            let message = `${stderr || '\n'}    at ${__from}`;
            message += `\n    exit code: ${code}${exitCodeInfo(exitCode) ? ' (' + exitCodeInfo(exitCode) + ')' : ''}`;
            if (signal !== null) {
                message += `\n    signal: ${signal}`;
            }
            let output = new ProcessOutput({
                exitCode,
                signal,
                stdout,
                stderr,
                combined,
                message,
            });
            (code === 0 || promise._nothrow ? resolve : reject)(output);
            promise._resolved = true;
        });
        let stdout = '', stderr = '', combined = '';
        if (!promise._piped) {
            // If process is piped, don't collect or print output.
            child.stdout.on('data', data => {
                if (tx.verbose && !promise._quiet)
                    process.stdout.write(data);
                stdout += data;
                combined += data;
            });
        }
        child.stderr.on('data', data => {
            // Stderr should be printed regardless of piping.
            if (tx.verbose && !promise._quiet)
                process.stderr.write(data);
            stderr += data;
            combined += data;
        });
        promise.child = child;
        if (promise._postrun)
            promise._postrun(); // In case $1.pipe($2), after both subprocesses are running, we can pipe $1.stdout to $2.stdin.
    };
    setTimeout(promise._run, 0); // Make sure all subprocesses are started, if not explicitly by await or then().
    return promise;
}
exports.$async = $async;
class InternalProcessPromise extends Promise {
    constructor() {
        super(...arguments);
        this._nothrow = false;
        this._quiet = false;
        this._resolved = false;
        this._inheritStdin = true;
        this._piped = false;
        this._prerun = undefined;
        this._run = undefined;
        this._postrun = undefined;
    }
    get stdin() {
        this._inheritStdin = false;
        this._run?.();
        return this.child.stdin;
    }
    get stdout() {
        this._inheritStdin = false;
        this._run?.();
        return this.child.stdout;
    }
    get stderr() {
        this._inheritStdin = false;
        this._run?.();
        return this.child.stderr;
    }
    get exitCode() {
        return this
            .then(p => p.exitCode)
            .catch(p => p.exitCode);
    }
    then(onfulfilled, onrejected) {
        if (this._run)
            this._run();
        return super.then(onfulfilled, onrejected);
    }
    pipe(dest) {
        if (this._resolved) {
            if (dest instanceof InternalProcessPromise) {
                dest.kill();
            }
            throw new Error('The pipe() method shouldn\'t be called after promise is already resolved!');
        }
        this._piped = true;
        if (dest instanceof InternalProcessPromise) {
            dest._inheritStdin = false;
            dest._prerun = this._run;
            dest._postrun = () => this.stdout.pipe(dest.child.stdin);
            return dest;
        }
        else {
            this._postrun = () => this.stdout.pipe(dest);
            return this;
        }
    }
    async kill(signal = 'SIGTERM') {
        this.catch(_ => _);
        let children = await psTree(this.child.pid);
        for (const p of children) {
            try {
                process.kill(Number(p.PID), signal);
            }
            catch (e) {
            }
        }
        try {
            process.kill(this.child.pid, signal);
        }
        catch (e) {
        }
    }
    nothrow() {
        this._nothrow = true;
        return this;
    }
    quiet() {
        this._quiet = true;
        return this;
    }
}
class ProcessOutput extends Error {
    constructor(option) {
        super(option.message);
        this.exitCode = option.exitCode ?? 0;
        this.stdout = option.stdout ?? "";
        this.stderr = option.stderr ?? "";
        this.combined = option.combined ?? this.stdout + this.stderr;
        this.signal = option.signal ?? null;
    }
    toString() {
        return this.combined;
    }
}
exports.ProcessOutput = ProcessOutput;
function printCmd(cmd) {
    if (/\n/.test(cmd)) {
        console.log(cmd
            .split('\n')
            .map((line, i) => (i === 0 ? '$' : '>') + ' ' + colorize(line))
            .join('\n'));
    }
    else {
        console.log('$', colorize(cmd));
    }
}
function colorize(cmd) {
    return cmd.replace(/^[\w_.-]+(\s|$)/, substr => {
        return chalk_1.default.greenBright(substr);
    });
}
function substitute(arg) {
    if (arg instanceof ProcessOutput) {
        return arg.stdout.replace(/\n$/, '');
    }
    return `${arg}`;
}
function trimEndLine(s) {
    return s.replace(/\n$/, '');
}
function quote(arg) {
    if (/^[a-z0-9/_.-]+$/i.test(arg) || arg === '') {
        return arg;
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
        + `'`;
}
exports.quote = quote;
function exitCodeInfo(exitCode) {
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
    }[exitCode];
}
async function fetch(url, init) {
    if (tx.verbose) {
        if (typeof init !== 'undefined') {
            console.log('$', colorize(`fetch ${url}`), init);
        }
        else {
            console.log('$', colorize(`fetch ${url}`));
        }
    }
    return (0, node_fetch_1.default)(url, init);
}
exports.fetch = fetch;
function cd(path) {
    if (tx.verbose)
        console.log('$', colorize(`cd ${path}`));
    process.chdir(path);
}
exports.cd = cd;
function cdAsync(path) {
    return (0, util_1.promisify)(cd)(path);
}
exports.cdAsync = cdAsync;
function sleep(second) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, second * 1000);
}
exports.sleep = sleep;
function sleepAsync(second) {
    return (0, util_1.promisify)(resolve => setTimeout(resolve, second * 1000));
}
exports.sleepAsync = sleepAsync;
// Retries a command a few times. Will return after the first
// successful attempt, or will throw after specifies attempts count.
const retryAsync = (count = 5) => async (template, ...args) => {
    while (count-- > 0) {
        try {
            return await $async(template, ...args);
        }
        catch (p) {
            if (count === 0)
                throw p;
        }
    }
};
exports.retryAsync = retryAsync;
//# sourceMappingURL=index.js.map