# TX

Rewritten [google/zx](https://github.com/google/zx) bash script library with typescript.

## Install

```shell
npm i @katlin/tx
```

## Features

- Library Only
- Typescript

## Documentation

### ``$`command` ``

Executes a given string using the `spawn` function from the
`child_process` package and returns `ProcessPromise<ProcessOutput>`.

Everything passed through `${...}` will be automatically escaped and quoted.

```ts
import {$, $async} from '@katlin/tx';

// sync
let name = 'foo & bar'
$`mkdir ${name}`;

// async
(async () => {
  let output = await $async`echo ${name}`;
  console.log(output);
})()
```

**There is no need to add extra quotes.** Read more about it in
[quotes](docs/quotes.md).

You can pass an array of arguments if needed:

```ts
let flags = [
  '--oneline',
  '--decorate',
  '--color',
]
$`git log ${flags}`
```

If the executed program returns a non-zero exit code,
`ProcessOutput` will be thrown.

```ts
try {
  $`exit 1`
} catch (p) {
  console.log(`Exit code: ${p.exitCode}`)
  console.log(`Error: ${p.stderr}`)
}
```

### Functions

#### `cd()`

Changes the current working directory.

```ts
import {cd} from '@katlin/tx';

cd('/tmp')
$`pwd` // outputs /tmp
```

### Configuration

```ts
import tx from '@katlin/tx';
```

#### `tx.shell`

Specifies what shell is used. Default is `which bash`.

```ts
tx.shell = '/usr/bin/bash'
```

#### `tx.prefix`

Specifies the command that will be prefixed to all commands run.

Default is `set -euo pipefail;`.

Or use a CLI argument: `--prefix='set -e;'`

#### `tx.quote`

Specifies a function for escaping special characters during command substitution.

#### `tx.verbose`

Specifies verbosity. Default is `true`.

In verbose mode, the `tx` prints all executed commands alongside with their outputs.

Or use a CLI argument `--quiet` to set `tx.verbose = false`.

## Credit

- [google/zx](https://github.com/google/zx)

## License

[Apache-2.0](LICENSE)