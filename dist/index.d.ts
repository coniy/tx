/// <reference types="node" />
import { Readable, Writable } from "stream";
import { RequestInit } from 'node-fetch';
declare let tx: {
    verbose: boolean;
    shell: string;
    prefix: string;
};
export default tx;
export declare function $(template: TemplateStringsArray, ...args: any[]): ProcessOutput;
export declare function $async(pieces: TemplateStringsArray, ...args: any[]): ProcessPromise;
export interface ProcessPromise extends Promise<any> {
    get stdin(): Writable | null;
    get stdout(): Readable | null;
    get stderr(): Readable | null;
    get exitCode(): Promise<number>;
    then<R1 = any, R2 = any>(onfulfilled?: ((value: any) => R1 | PromiseLike<R1>) | undefined | null, onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | undefined | null): Promise<R1 | R2>;
    pipe(dest: ProcessPromise | NodeJS.WritableStream): ProcessPromise;
    kill(signal?: string): void;
    nothrow(): ProcessPromise;
    quiet(): ProcessPromise;
}
export declare class ProcessOutput extends Error {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly combined: string;
    readonly signal: NodeJS.Signals | null;
    constructor(option: Partial<ProcessOutput>);
    toString(): string;
}
export declare function quote(arg: string): string;
export declare function fetch(url: string, init?: RequestInit): Promise<import("node-fetch").Response>;
export declare function cd(path: string): void;
export declare function cdAsync(path: string): Promise<unknown>;
export declare function sleep(second: number): void;
export declare function sleepAsync(second: number): () => Promise<unknown>;
export declare const retryAsync: (count?: number) => (template: TemplateStringsArray, ...args: any[]) => Promise<any>;
//# sourceMappingURL=index.d.ts.map