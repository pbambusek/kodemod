# kodemod
A simple codemod runner for codemods built as Babel plugins. Prettier included.

## Install

```bash
yarn add kodemod
```

## Usage

The kodemod expects a single Babel plugin and a path to directory which the plugin should be applied to.

```bash
yarn kodemod -p path/to/plugin.ts path/to/refactor
```

If the plugin needs some options, they can be passed as a JSON object

```bash
yarn kodemod -p path/to/plugin.ts -o '{"doMagic":true}' path/to/refactor
```

If a file is transformed, it is also formatted by Prettier before its saved. The runner looks for a Prettier config based on the file location.

## License

This project is licensed under the [MIT License](LICENSE)
