const fs = require("fs");
const path = require("path");

const diff = require("diff");
const glob = require("glob");
const { quoteAll } = require("shescape");

const { run } = require("../utils/action");
const commandExists = require("../utils/command-exists");
const { initLintResult } = require("../utils/lint-result");

/** @typedef {import('../utils/lint-result').LintResult} LintResult */

/**
 * https://clang.llvm.org/docs/ClangFormat.html
 */
class ClangFormat {
	static get name() {
		return "clang_format";
	}

	/**
	 * Verifies that all required programs are installed. Throws an error if programs are missing
	 * @param {string} dir - Directory to run the linting program in
	 * @param {string} prefix - Prefix to the lint command
	 */
	static async verifySetup(dir, prefix = "") {
		if (!(await commandExists("clang-format"))) {
			throw new Error("clang-format is not installed");
		}
	}

	/**
	 * Runs the linting program and returns the command output
	 * @param {string} dir - Directory to run the linter in
	 * @param {string[]} extensions - File extensions which should be linted
	 * @param {string} args - Additional arguments to pass to the linter
	 * @param {boolean} fix - Whether the linter should attempt to fix code style issues automatically
	 * @param {string} prefix - Prefix to the lint command
	 * @returns {{status: number, stdout: string, stderr: string}} - Output of the lint command
	 */
	static lint(dir, extensions, args = "", fix = false, prefix = "") {
		const pattern =
			extensions.length === 1 ? `**/*.${extensions[0]}` : `**/*.{${extensions.join(",")}}`;
		const files = glob.sync(pattern, { cwd: dir, nodir: true });
		const escapedFiles = quoteAll(files).join(" ");

		if (fix) {
			const fixArg = fix ? "-i" : "--dry-run";
			return run(`${prefix} clang-format ${fixArg} -Werror ${args} ${escapedFiles}`, {
				dir,
				ignoreErrors: true,
			});
		}

		const retVal = {
			status: 0,
			stdout: "",
			stderr: ""
		};

		const results = [];

		for (const file of files) {
			const result = run(`${prefix} clang-format -Werror ${args} ${file}`, {
				dir,
				ignoreErrors: true,
			});
			if (result.status !== 0) {
				retVal.status = result.status;
			}
			try {
				const changes = diff.diffLines(fs.readFileSync(path.join(dir, file), 'utf8'), result.stdout);
				// console.log({ file, changes });
				if (changes.length > 0) {
					results.push({ file, changes });
				}
			} catch (err) {
				retVal.stderr += `${err}`;
			}
			retVal.stderr += result.stderr;
		}
		retVal.status = results.length > 0 ? 1 : 0;
		retVal.stdout = JSON.stringify(results);
		return retVal;
	}

	/**
	 * Parses the output of the lint command. Determines the success of the lint process and the
	 * severity of the identified code style violations
	 * @param {string} dir - Directory in which the linter has been run
	 * @param {{status: number, stdout: string, stderr: string}} output - Output of the lint command
	 * @returns {LintResult} - Parsed lint result
	 */
	static parseOutput(dir, output) {
		const lintResult = initLintResult();
		lintResult.isSuccess = output.status === 0;
		if (lintResult.isSuccess || !output) {
			return lintResult;
		}

		lintResult.error = [];

		// console.log(output);
		const files = JSON.parse(output.stdout);
		for (const file of files) {
			let line = 1;
			let lineCount = 1;
			let message = "";

			const addError = () => {
				if (message.length !== 0) {
					lintResult.error.push({
						path: file.file,
						firstLine: line,
						lastLine: line + lineCount - 1,
						message
					});
					line += lineCount;
					message = "";
				}
			};

			const visibleWhitespace = (text) => text.replace(/ /g, "·").replace(/\t/g, "▸\t");

			const formatLines = (text, prefix) => {
				const lines = text.split(/\n/);
				if (text.endsWith("\n")) {
					lines.pop();
				}
				return lines.map((l) => {
					const lineParts = l.match(/^(\s*)(.*?)(\s*)$/);
					return prefix + visibleWhitespace(lineParts[1]) + lineParts[2] + visibleWhitespace(lineParts[3]);
				}).join("\n");
			};
	
			for (const change of file.changes) {
				if (!change.added) {
					addError();
				}

				if (change.removed) {
					message += `${formatLines(change.value, "- ")}\n`;
					lineCount = change.count;
				} else if (change.added) {
					if (message.length !== 0) {
						message += "***\n";
					} else {
						lineCount = change.count;
					}
					message += formatLines(change.value, "+ ");
				} else {
					line += change.count;
				}
			}

			addError();
		}
		// console.log(lintResult);

		return lintResult;
	}
}

module.exports = ClangFormat;
