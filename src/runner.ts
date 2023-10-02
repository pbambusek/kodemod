import fs from 'fs/promises';
import path from 'path';
import * as babel from '@babel/core';
import { Visitor } from '@babel/traverse';
import chalk from 'chalk';
import globby from 'globby';
import prettier from 'prettier';
import yargs from 'yargs';
import * as recast from 'recast';

type PluginOptions = Record<string, unknown>;

async function loadPlugin(pluginPath: string, pluginOptions: PluginOptions = {}): Promise<[Visitor, PluginOptions]> {
    const pluginModule = await import(path.resolve(pluginPath));
    return [pluginModule.default, pluginOptions];
}

async function transformFile(
    inputFilename: string,
    plugin: [Visitor, PluginOptions],
    { verbose }: { verbose: boolean }
): Promise<{ transformed: boolean; error: boolean }> {
    try {
        const code = await fs.readFile(inputFilename, 'utf8');

        const ast = recast.parse(code, {
            parser: require('recast/parsers/babel-ts'),
        });

        await babel.transformFromAstAsync(ast, code, {
            ast: true,
            retainLines: true,
            cloneInputAst: false,
            filename: inputFilename,
            plugins: [
                // prettier-keep-line
                ['@babel/plugin-syntax-typescript', { isTSX: inputFilename.endsWith('.tsx') }],
                plugin,
            ],
        });

        const transformed = recast.print(ast);

        const prettierConfig = await prettier.resolveConfig(inputFilename);
        const formattedCode = await prettier.format(transformed.code || '', {
            filepath: inputFilename,
            ...prettierConfig,
        });

        if (formattedCode !== code) {
            await fs.writeFile(inputFilename, formattedCode);
            console.log(chalk.reset(inputFilename));
            return { transformed: true, error: false };
        }

        if (verbose) {
            console.log(chalk.dim(inputFilename));
        }

        return { transformed: false, error: false };
    } catch (err) {
        console.error(chalk.red(`Error in ${inputFilename}: ${err.message}`));
        return { transformed: false, error: true };
    }
}

void (async () => {
    const {
        inputPath,
        plugin: pluginPath,
        pluginOptions,
        verbose,
    } = yargs(process.argv.slice(2))
        .usage('Usage: $0 --plugin <pluginPath> [options] <inputPath>')
        .command('$0 <inputPath>', 'Transform files in the inputPath', (yargs) => {
            yargs.positional('inputPath', {
                describe: 'Path to the folder with files to transform',
                type: 'string',
            });
        })
        .demandCommand(1, 'You must provide an inputPath argument')
        .option('plugin', {
            alias: 'p',
            describe: 'Path to the plugin file',
            type: 'string',
            demandOption: true,
        })
        .option('pluginOptions', {
            alias: 'o',
            describe: 'Plugin options as a JSON string',
            type: 'string',
            coerce: JSON.parse,
        })
        .option('verbose', {
            alias: 'v',
            describe: 'Output more information during execution',
            type: 'boolean',
        })
        .version(false).argv;

    const executionStart = performance.now();
    const plugin = await loadPlugin(pluginPath, pluginOptions);

    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
        /**
         * The path normalization is required for Windows paths
         * See: https://github.com/mrmlnc/fast-glob#how-to-write-patterns-on-windows
         */
        const normalizedPath = inputPath.replace(/\\/g, '/');
        const filePaths = await globby([`${normalizedPath}/**/*.{js,jsx,ts,tsx}`, '!**/node_modules']);

        let transformedFiles = 0;
        let errorFiles = 0;

        console.log(`${filePaths.length} found files...`);
        for (const filePath of filePaths) {
            const { transformed, error } = await transformFile(filePath, plugin, { verbose });
            if (transformed) {
                transformedFiles++;
            }
            if (error) {
                errorFiles++;
            }
        }

        console.log(`\n${transformedFiles} changed files, ${errorFiles} errors`);

        const executionEnd = performance.now();
        const totalExecution = ((executionEnd - executionStart) / 1000).toFixed(2);
        console.log(`Executed in ${totalExecution}s`);
    } else {
        console.error('Invalid input path. Provide a directory.');
    }
})();
