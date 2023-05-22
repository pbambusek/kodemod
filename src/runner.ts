import fs from 'fs/promises';
import path from 'path';
import * as babel from '@babel/core';
import { Visitor } from '@babel/traverse';
import chalk from 'chalk';
import globby from 'globby';
import prettier from 'prettier';
import yargs from 'yargs';

type PluginOptions = Record<string, unknown>;

async function loadPlugin(pluginPath: string, pluginOptions: PluginOptions = {}): Promise<[Visitor, PluginOptions]> {
    const pluginModule = await import(path.resolve(pluginPath));
    return [pluginModule.default, pluginOptions];
}

async function transformFile(
    inputFilename: string,
    plugin: [Visitor, PluginOptions]
): Promise<{ transformed: boolean; error: boolean }> {
    try {
        const code = await fs.readFile(inputFilename, 'utf8');

        const result = await babel.transformAsync(code, {
            retainLines: true,
            plugins: [
                // prettier-keep-line
                ['@babel/plugin-syntax-typescript', { isTSX: inputFilename.endsWith('.tsx') }],
                plugin,
            ],
        });

        if (result) {
            const prettierConfig = await prettier.resolveConfig(inputFilename);
            const transformedFormatted = prettier.format(result.code || '', {
                ...prettierConfig,
                parser: 'typescript',
            });

            if (transformedFormatted !== code) {
                await fs.writeFile(inputFilename, transformedFormatted);
                console.log(chalk.reset(inputFilename));
                return { transformed: true, error: false };
            }
        }

        console.log(chalk.dim(inputFilename));
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
        .version(false).argv;

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

        for (const filePath of filePaths) {
            const { transformed, error } = await transformFile(filePath, plugin);
            if (transformed) {
                transformedFiles++;
            }
            if (error) {
                errorFiles++;
            }
        }

        console.log(`\n${filePaths.length} found files, ${transformedFiles} changed files, ${errorFiles} errors`);
    } else {
        console.error('Invalid input path. Provide a directory.');
    }
})();
