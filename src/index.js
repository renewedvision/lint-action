const { join } = require("path");
const { name: actionName } = require("../package");
const git = require("./git");
const github = require("./github");
const linters = require("./linters");
const { getInput, log } = require("./utils/action");

const GIT_NAME = actionName;
const GIT_EMAIL = `lint-action@samuelmeuli.com`;

// Abort action on unhandled promise rejections
process.on("unhandledRejection", err => {
	log(err, "error");
	throw new Error(`Exiting because of unhandled promise rejection`);
});

/**
 * Parses the action configuration and runs all enabled linters on matching files
 */
async function runAction() {
	const context = github.getContext();
	const autoFix = getInput("auto_fix") === "true";
	const commitMsg = getInput("commit_message", true);

	if (autoFix) {
		// Set Git committer username and password
		git.setUserInfo(GIT_NAME, GIT_EMAIL);
	}
	if (context.eventName === "pull_request") {
		// Fetch and check out PR branch. This is required because for "pull_request" events, the
		// Checkout Action (https://github.com/actions/checkout) checks out the PR's test merge commit
		// in detached head state
		git.fetchBranches();
		git.checkOutBranch(context.branch);
	}

	const checks = [];

	// Loop over all available linters
	for (const [linterId, linter] of Object.entries(linters)) {
		// Determine whether the linter should be executed on the commit
		if (getInput(linterId) === "true") {
			const fileExtensions = getInput(`${linterId}_extensions`, true);
			const lintDirRel = getInput(`${linterId}_dir`) || ".";
			const lintDirAbs = join(context.workspace, lintDirRel);

			// Check that the linter and its dependencies are installed
			log(`\nVerifying setup for ${linter.name}…`);
			await linter.verifySetup(lintDirAbs);
			log(`Verified ${linter.name} setup`);

			// Determine which files should be linted
			const fileExtList = fileExtensions.split(",");
			log(`Will use ${linter.name} to check the files with extensions ${fileExtList}`);

			// Lint and optionally auto-fix the matching files, parse code style violations
			log(
				`Linting ${autoFix ? "and auto-fixing " : ""}files in ${lintDirAbs} with ${linter.name}…`,
			);
			const results = linter.lint(lintDirAbs, fileExtList, autoFix);
			const resultsParsed = linter.parseResults(context.workspace, results);

			// Build and log a summary of linting errors/warnings
			let summary;
			if (resultsParsed[1].length > 0 && resultsParsed[2].length > 0) {
				summary = `Found ${resultsParsed[2].length} errors and ${resultsParsed[1].length} warnings with ${linter.name}`;
			} else if (resultsParsed[2].length > 0) {
				summary = `Found ${resultsParsed[2].length} errors with ${linter.name}`;
			} else if (resultsParsed[1].length > 0) {
				summary = `Found ${resultsParsed[1].length} warnings with ${linter.name}`;
			} else {
				summary = `No code style issues found with ${linter.name}`;
			}
			log(summary);

			if (autoFix) {
				// Commit and push changes from auto-fixing
				git.commitChanges(commitMsg.replace(/\${linter}/g, linter.name));
				git.pushChanges(context);
			}

			checks.push({ checkName: linter.name, resultsParsed, summary });
		}
	}

	// Add commit annotations after running all linters. To be displayed on pull requests, the
	// annotations must be added to the last commit on the branch. This can either be a user commit or
	// one of the auto-fix commits
	log(""); // Create empty line in logs
	const headSha = git.getHeadSha();
	await Promise.all(
		checks.map(({ checkName, resultsParsed, summary }) =>
			github.createCheck(checkName, headSha, context, resultsParsed, summary),
		),
	);
}

runAction();
