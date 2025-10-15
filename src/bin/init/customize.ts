import path from "path";
import fs from "fs/promises";

/**
 * Customizes the cloned template after checkout by updating package.json and removing .git.
 * @param destinationPath The path where the project was cloned.
 * @param projectName The new name for the project.
 */
export async function customizeTemplate(destinationPath: string, projectName: string) {
	console.log("✅ Template cloned. Customizing project...");

	// --- 1. Update package.json ---
	const packageJsonPath = path.join(destinationPath, "package.json");
	try {
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);

		// Set the new project name and reset version/description
		packageJson.name = projectName;
		packageJson.version = "0.1.0";
		packageJson.description = `A new project named ${projectName}`;

		// Remove git-related fields to avoid pointing to the template repo
		delete packageJson.repository;
		delete packageJson.bugs;
		delete packageJson.homepage;

		await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
		console.log(`   - ✔ Updated package.json with project name: ${projectName}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`   - ⚠️ Could not update package.json. You may need to do it manually. Reason: ${message}`);
	}

	// --- 2. Remove the .git folder to allow for a fresh start ---
	const gitFolderPath = path.join(destinationPath, ".git");
	try {
		await fs.rm(gitFolderPath, { recursive: true, force: true });
		console.log('   - ✔ Removed .git folder. You can now run "git init" to start fresh.');
	} catch (error) {
		if (error instanceof Error) {
			console.error(`   - ❌ Failed to remove .git folder: ${error.message}`);
		} else {
			console.error(`   - ❌ Failed to remove .git folder: An unknown error occurred.`);
		}
	}
}
