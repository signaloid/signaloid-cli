export type InputType = "text-input" | "basic-slider" | "distribution-slider" | "multiple-choice" | "file";

export interface BaseInputConfig {
	id: string;
	name: string;
	argumentFlag: string;
	type: InputType;
}

export interface TextInputConfig extends BaseInputConfig {
	type: "text-input";
	initialValue: string;
}

export interface SliderConfig extends BaseInputConfig {
	type: "basic-slider" | "distribution-slider";
	min: number;
	max: number;
	step: number;
	initialValue: number;
	xAxisLabel: string;
	adjustWidth?: boolean;
	isDistribution: boolean;
	initialDistribution?: [number, number][];
}

export interface MultipleChoiceConfig extends BaseInputConfig {
	type: "multiple-choice";
	initialValue: string;
	options: { name: string; value: string }[];
}

export interface FileInputConfig extends BaseInputConfig {
	type: "file";
	accept: string;
	destination: string;
}

export type InputConfig = TextInputConfig | SliderConfig | MultipleChoiceConfig | FileInputConfig;

export const inputTypeMap: { [key in InputType]: string } = {
	["text-input"]: "Number input field",
	["basic-slider"]: "Basic slider",
	["distribution-slider"]: "Distribution slider",
	["multiple-choice"]: "Multiple choice",
	["file"]: "File upload",
};
