const ClangFormat = require("../../../src/linters/clang-format");

const testName = "clang-format";
const linter = ClangFormat;
const commandPrefix = "";
const extensions = ["c", "mm"];

// Linting without auto-fixing
function getLintParams(dir) {
	return {
		// Expected output of the linting function
		cmdOutput: {
			status: 1,
			stdout: '[{"file":"file1.c","changes":[{"count":1,"removed":true,"value":"\\t#include <stdio.h>\\n"},{"count":1,"added":true,"value":"#include <stdio.h>\\n"},{"count":3,"value":"\\n#define THREE (3)\\n\\n"},{"count":1,"removed":true,"value":"\\n"},{"count":2,"value":"#define FOUR (4)\\n\\n"},{"count":6,"removed":true,"value":"int main(int argc, char* argv[]) { \\n\\tfor (int i = 0; i < argc; ++i)\\n\\t{\\n\\t\\tprintf(argv[i]);\\n\\t}\\n\\treturn  0;\\n"},{"count":5,"added":true,"value":"int main(int argc, char *argv[]) {\\n  for (int i = 0; i < argc; ++i) {\\n    printf(argv[i]);\\n  }\\n  return 0;\\n"},{"count":1,"value":"}\\n"},{"count":1,"added":true,"value":"\\n"},{"count":1,"value":"int func() {}"}]},{"file":"file2.mm","changes":[{"count":1,"removed":true,"value":"@interface Foo : NSObject @end\\n"},{"count":2,"added":true,"value":"@interface Foo : NSObject\\n@end"}]}]',
		},
		// Expected output of the parsing function
		lintResult: {
			isSuccess: false,
			warning: [],
			error: [
				{
					path: "file1.c",
					firstLine: 1,
					lastLine: 1,
					message: "- ▸\t#include <stdio.h>\n***\n+ #include <stdio.h>",
				},
				{
					path: "file1.c",
					firstLine: 5,
					lastLine: 5,
					message: "- \n",
				},
				{
					path: "file1.c",
					firstLine: 8,
					lastLine: 13,
					message: "- int main(int argc, char* argv[]) {·\n" +
						'- ▸\tfor (int i = 0; i < argc; ++i)\n' +
						'- ▸\t{\n' +
						'- ▸\t▸\tprintf(argv[i]);\n' +
						'- ▸\t}\n' +
						'- ▸\treturn  0;\n' +
						'***\n' +
						'+ int main(int argc, char *argv[]) {\n' +
						'+ ··for (int i = 0; i < argc; ++i) {\n' +
						'+ ····printf(argv[i]);\n' +
						'+ ··}\n' +
						'+ ··return 0;',
				},
				{
					path: "file1.c",
					firstLine: 15,
					lastLine: 15,
					message: "+ ",
				},
				{
					path: "file2.mm",
					firstLine: 1,
					lastLine: 1,
					message: '- @interface Foo : NSObject @end\n' +
						'***\n' +
						'+ @interface Foo : NSObject\n' +
						'+ @end',
				},
			],
		},
	};
}

// Linting with auto-fixing
function getFixParams(dir) {
	return {
		// Expected output of the linting function
		cmdOutput: {
			status: 0,
			stderrParts: [],
		},
		// Expected output of the parsing function
		lintResult: {
			isSuccess: true,
			warning: [],
			error: [],
		},
	};
}

module.exports = [testName, linter, commandPrefix, extensions, getLintParams, getFixParams];
