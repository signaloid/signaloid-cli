/** The error code carried by an SDK error, or by the body an error keeps as `details`. */
export function errorCodeOf(e: any): string | undefined {
	return e?.code ?? e?.details?.code;
}

/** The HTTP status carried by an SDK or axios error, if the API answered at all. */
export function httpStatusOf(e: any): number | undefined {
	return e?.status ?? e?.response?.status ?? e?.details?.response?.status;
}
