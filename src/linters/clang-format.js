const glob = require("glob");
const { quoteAll } = require("shescape");

const { run } = require("../utils/action");
const commandExists = require("../utils/command-exists");
const { initLintResult } = require("../utils/lint-result");

const fs = require("fs");
const Diff = require("Diff");
const path = require("path");

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
		} else {
			var retVal = {
				status: 0,
				stdout: "",
				stderr: ""
			};
			var results = [];
			for (var file of files) {
				var result = run(`${prefix} clang-format -Werror ${args} ${file}`, {
					dir,
					ignoreErrors: true,
				});
				if (result.status != 0) {
					retVal.status = result.status;
				}
				try {
					const changes = Diff.diffLines(fs.readFileSync(path.join(dir, file), 'utf8'), result.stdout);
					//console.log({ file: file, changes: changes });
					if (changes.length > 0) {
						results.push({ file: file, changes: changes });
					}
				} catch (err) {
					retVal.stderr += "" + err;
				}
				retVal.stderr += result.stderr;
			}
			retVal.status = results.length > 0 ? 1 : 0;
			retVal.stdout = JSON.stringify(results);
			return retVal;
		}
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

		//console.log(output);
		const files = JSON.parse(output.stdout);
		for (const file of files) {
			var line = 1;
			var lineCount = 1;
			var message = "";

			const addError = () => lintResult.error.push({
					path: file.file,
					firstLine: line,
					lastLine: line + lineCount - 1,
					message: message
				});
	
			for (const change of file.changes) {
				if (change.removed) {
					if (message.length !== 0) {
						addError();
						line += lineCount;
						error = "";
					}
					message += change.value.split(/\n/).map((line) => "- " + line).join("\n") + "\n";
					lineCount = change.count;
				} else if (change.added) {
					message += "---\n";
					message += change.value.split(/\n/).map((line) => "+ " + line).join("\n") + "\n";
				} else {
					if (message.length !== 0) {
						addError();
						line += lineCount;
						message = "";
					}
					line += change.count;
				}
			}

			if (message.length !== 0) {
				addError();
			}
		}
		//console.log(result);

		return lintResult;
	}
}

module.exports = ClangFormat;
