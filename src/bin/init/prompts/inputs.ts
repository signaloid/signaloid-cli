import inquirer from "inquirer";
import {
	FileInputConfig,
	InputConfig,
	InputType,
	inputTypeMap,
	MultipleChoiceConfig,
	SliderConfig,
	TextInputConfig,
} from "../models/input.models";

export type { InputConfig };

export function validateAcceptPatterns(value: string): true | string {
	const patterns = value
		.split(",")
		.map((pattern) => pattern.trim())
		.filter(Boolean);
	const malformed = patterns.filter((pattern) => !pattern.startsWith(".") && !pattern.includes("/"));
	if (malformed.length > 0) {
		return `Use '.${malformed[0]}' for an extension, or a MIME type such as 'text/${malformed[0]}'.`;
	}
	return true;
}

export function normalizeDestination(value: string): string {
	return value.trim().replace(/^\/+|\/+$/g, "");
}

export function validateDestination(value: string): true | string {
	const destination = normalizeDestination(value);
	if (!destination) {
		return "Destination cannot be empty.";
	}
	if (destination.split("/").includes("..")) {
		return "Destination cannot contain '..'.";
	}
	return true;
}

/**
 * Prompts the user to configure a series of inputs for the application.
 * It supports text fields, basic sliders, and distribution sliders.
 */
export async function promptForInputs(): Promise<InputConfig[]> {
	console.log("\n⚙️  Configuring interactive inputs...");

	const { numInputs } = await inquirer.prompt<{ numInputs: number }>([
		{
			type: "number",
			name: "numInputs",
			message: "How many inputs will your application have?",
			default: 1,
			filter: Number,
			validate: (input) => (input ? true : "Please enter a non-negative number."),
		},
	]);

	const inputs: InputConfig[] = [];
	for (let i = 0; i < numInputs; i++) {
		console.log(`\n--- Configuring Input ${i + 1} of ${numInputs} ---`);

		const { inputType } = await inquirer.prompt<{ inputType: InputType }>([
			{
				type: "list",
				name: "inputType",
				message: "Select the type for this input:",
				default: "basic-slider",
				choices: [
					{ name: "Basic slider", value: "basic-slider" },
					{ name: "Distribution slider", value: "distribution-slider" },
					{ name: "Text input", value: "text-input" },
					{ name: "Multiple choice", value: "multiple-choice" },
					{ name: "File upload", value: "file" },
				],
			},
		]);

		const commonDetails = await inquirer.prompt([
			{
				type: "input",
				name: "name",
				message: `${inputTypeMap[inputType]} label:`,
				default: "Input A",
				validate: (input: string) => (input.length > 0 ? true : "Input name cannot be empty."),
			},
			{
				type: "input",
				name: "argumentFlag",
				message: 'Argument flag (e.g., "-k" or "-c"):',
				default: " -k ",
				validate: (input: string) => (input.length > 0 ? true : "Argument flag cannot be empty."),
			},
		]);

		const id = commonDetails.name
			.replace(/\s+/g, "-")
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "");

		if (inputType === "text-input") {
			const { initialValue } = await inquirer.prompt([
				{
					type: "input",
					name: "initialValue",
					message: "Initial value for the text field:",
					default: "",
				},
			]);

			const textInput: TextInputConfig = {
				id,
				name: commonDetails.name,
				argumentFlag: ` ${commonDetails.argumentFlag.trim()} `,
				type: "text-input",
				initialValue,
			};
			inputs.push(textInput);
		} else if (inputType === "distribution-slider" || inputType === "basic-slider") {
			// This block handles both 'basic-slider' and 'distribution-slider'
			const sliderDetails = await inquirer.prompt([
				{ type: "input", name: "min", message: "Minimum value:", default: "0", filter: Number },
				{ type: "input", name: "max", message: "Maximum value:", default: "10", filter: Number },
				{ type: "input", name: "step", message: "X-axis step value:", default: "0.5", filter: Number },
				{ type: "input", name: "initialValue", message: "Initial value:", default: "5", filter: Number },
				{
					type: "input",
					name: "xAxisLabel",
					default: "x-axis label",
					message: `${inputTypeMap[inputType]} x-axis label:`,
				},
			]);

			const isDistribution = inputType === "distribution-slider";

			const sliderObject: SliderConfig = {
				id,
				name: commonDetails.name,
				argumentFlag: ` ${commonDetails.argumentFlag.trim()} `,
				type: inputType,
				min: sliderDetails.min,
				max: sliderDetails.max,
				step: sliderDetails.step,
				initialValue: sliderDetails.initialValue,
				xAxisLabel: sliderDetails.xAxisLabel,
				adjustWidth: false, // A reasonable default
				isDistribution,
			};

			if (isDistribution) {
				sliderObject.initialDistribution = [
					[sliderDetails.initialValue - sliderDetails.step, 50],
					[sliderDetails.initialValue, 100],
					[sliderDetails.initialValue + sliderDetails.step, 50],
				];
			}
			inputs.push(sliderObject);
		} else if (inputType === "multiple-choice") {
			const numberOfOptions = await inquirer.prompt([
				{
					type: "number",
					name: "numberOfOptions",
					message: "How many options do you want to add?",
					default: 2,
					validate: (value) => {
						if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
							return "Please enter a whole number greater than 0";
						}
						return true;
					},
				},
			]);

			const options = [];
			for (let i = 0; i < numberOfOptions.numberOfOptions; i++) {
				const option = await inquirer.prompt([
					{
						type: "input",
						name: "optionName",
						message: "Enter the name of the option:",
						validate: (value) => {
							if (value.length === 0) {
								return "Please enter a non-empty option name";
							}
							return true;
						},
					},
					{
						type: "input",
						name: "optionValue",
						message: "Enter the value of the option:",
						validate: (value) => {
							if (value.length === 0) {
								return "Please enter a non-empty option value";
							}
							return true;
						},
					},
				]);
				options.push({
					name: option.optionName,
					value: option.optionValue,
				});
			}

			const multipleChoiceObject: MultipleChoiceConfig = {
				id,
				name: commonDetails.name,
				type: inputType,
				initialValue: options[0].value,
				argumentFlag: ` ${commonDetails.argumentFlag.trim()} `,
				options: options,
			};
			inputs.push(multipleChoiceObject);
		} else if (inputType === "file") {
			const fileDetails = await inquirer.prompt([
				{
					type: "input",
					name: "accept",
					message: "Accepted file types, e.g. '.csv' or 'text/csv' (blank for any):",
					default: "",
					filter: (value: string) => value.trim(),
					validate: validateAcceptPatterns,
				},
				{
					type: "input",
					name: "destination",
					message: "Upload destination under the user's cloud storage:",
					default: "demo-inputs",
					filter: normalizeDestination,
					validate: validateDestination,
				},
			]);

			const fileInput: FileInputConfig = {
				id,
				name: commonDetails.name,
				argumentFlag: ` ${commonDetails.argumentFlag.trim()} `,
				type: "file",
				accept: fileDetails.accept,
				destination: fileDetails.destination,
			};
			inputs.push(fileInput);
		}
	}

	return inputs;
}
